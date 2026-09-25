package services

import (
	"context"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"qa-mail-manager/internal/mailtm"
	"qa-mail-manager/internal/models"
)

const (
	// maxSearchPages caps how many Mail.tm pages a search scans, since Mail.tm has no search API.
	maxSearchPages = 10
	// syncAccountDelay spaces out background syncs; each account costs one or two Mail.tm
	// requests (login is skipped while its token is cached) and Mail.tm allows roughly
	// 8 requests per second per IP.
	syncAccountDelay = 400 * time.Millisecond
)

// InboxPage is one page of an account's inbox, newest message first.
type InboxPage struct {
	Messages []mailtm.MessageSummary
	Meta     InboxMeta
}

// InboxMeta describes an inbox page; Truncated means a search stopped before scanning every message.
type InboxMeta struct {
	Page      int  `json:"page"`
	Limit     int  `json:"limit"`
	Total     int  `json:"total"`
	HasMore   bool `json:"hasMore"`
	Truncated bool `json:"truncated,omitempty"`
}

// GetInbox returns one page of the account's inbox. With a search term it scans up to
// maxSearchPages pages and returns every match at once.
func (s *AccountService) GetInbox(ctx context.Context, id uuid.UUID, page int, search string) (*InboxPage, error) {
	account, err := s.getAccount(ctx, id)
	if err != nil {
		return nil, err
	}
	if page < 1 {
		page = 1
	}

	search = strings.TrimSpace(search)
	if search != "" {
		var inbox *InboxPage
		err := s.mailtm.WithToken(ctx, account.Email, account.Password, func(token string) error {
			var err error
			inbox, err = s.searchInbox(ctx, token, search)
			return err
		})
		return inbox, err
	}

	var result *mailtm.MessagePage
	err = s.mailtm.WithToken(ctx, account.Email, account.Password, func(token string) error {
		var err error
		result, err = s.mailtm.FetchInboxPage(ctx, token, page)
		return err
	})
	if err != nil {
		return nil, err
	}
	sortNewestFirst(result.Members)

	if page == 1 {
		s.recordInboxActivity(ctx, account.ID, result)
	}

	return &InboxPage{
		Messages: result.Members,
		Meta: InboxMeta{
			Page:    page,
			Limit:   mailtm.MessagesPerPage,
			Total:   result.TotalItems,
			HasMore: page*mailtm.MessagesPerPage < result.TotalItems,
		},
	}, nil
}

func (s *AccountService) searchInbox(ctx context.Context, token, search string) (*InboxPage, error) {
	term := strings.ToLower(search)
	matches := []mailtm.MessageSummary{}
	truncated := false

	for page := 1; ; page++ {
		result, err := s.mailtm.FetchInboxPage(ctx, token, page)
		if err != nil {
			return nil, err
		}
		for _, m := range result.Members {
			if messageMatches(m, term) {
				matches = append(matches, m)
			}
		}
		if page*mailtm.MessagesPerPage >= result.TotalItems || len(result.Members) == 0 {
			break
		}
		if page == maxSearchPages {
			truncated = true
			break
		}
	}

	sortNewestFirst(matches)
	return &InboxPage{
		Messages: matches,
		Meta: InboxMeta{
			Page:      1,
			Limit:     len(matches),
			Total:     len(matches),
			HasMore:   false,
			Truncated: truncated,
		},
	}, nil
}

func messageMatches(m mailtm.MessageSummary, term string) bool {
	for _, field := range []string{m.Subject, m.Intro, m.From.Name, m.From.Address} {
		if strings.Contains(strings.ToLower(field), term) {
			return true
		}
	}
	return false
}

// sortNewestFirst orders messages by createdAt, newest first.
func sortNewestFirst(messages []mailtm.MessageSummary) {
	sort.SliceStable(messages, func(i, j int) bool {
		return parseTime(messages[i].CreatedAt).After(parseTime(messages[j].CreatedAt))
	})
}

func parseTime(value string) time.Time {
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}
	}
	return t
}

// recordInboxActivity stores the newest message time and total count used to rank accounts.
func (s *AccountService) recordInboxActivity(ctx context.Context, accountID uuid.UUID, firstPage *mailtm.MessagePage) {
	var lastMessageAt *time.Time
	if len(firstPage.Members) > 0 {
		newest := firstPage.Members[0]
		for _, m := range firstPage.Members[1:] {
			if parseTime(m.CreatedAt).After(parseTime(newest.CreatedAt)) {
				newest = m
			}
		}
		if t := parseTime(newest.CreatedAt); !t.IsZero() {
			lastMessageAt = &t
		}
	}

	err := s.db.WithContext(ctx).Model(&models.MailAccount{}).
		Where("id = ?", accountID).
		UpdateColumns(map[string]any{
			"last_message_at": lastMessageAt,
			"message_count":   firstPage.TotalItems,
		}).Error
	if err != nil {
		log.Printf("inbox sync: failed to record activity for %s: %v", accountID, err)
	}
}

// MarkMessageRead marks a message as seen on Mail.tm.
func (s *AccountService) MarkMessageRead(ctx context.Context, id uuid.UUID, messageID string) error {
	account, err := s.getAccount(ctx, id)
	if err != nil {
		return err
	}
	return s.mailtm.MarkMessageSeen(ctx, account.Email, account.Password, messageID)
}

// DeleteMessage permanently deletes a message on Mail.tm, then refreshes the account's
// inbox activity so its message count and ranking stay accurate.
func (s *AccountService) DeleteMessage(ctx context.Context, id uuid.UUID, messageID string) error {
	account, err := s.getAccount(ctx, id)
	if err != nil {
		return err
	}
	if err := s.mailtm.DeleteMessage(ctx, account.Email, account.Password, messageID); err != nil {
		return err
	}

	// Best effort and detached from the request, so a slow Mail.tm does not delay the response
	go func() {
		syncCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.syncInbox(syncCtx, account); err != nil {
			log.Printf("inbox sync: %s after delete: %v", account.Email, err)
		}
	}()
	return nil
}

// GetMessageDetail logs in to Mail.tm and returns a single message's full body.
func (s *AccountService) GetMessageDetail(ctx context.Context, id uuid.UUID, messageID string) (*mailtm.MessageDetail, error) {
	account, err := s.getAccount(ctx, id)
	if err != nil {
		return nil, err
	}
	return s.mailtm.FetchMessageDetail(ctx, account.Email, account.Password, messageID)
}

// StartInboxSync refreshes every account's latest-message time on an interval until ctx ends,
// so the inbox can rank accounts by recent activity without polling Mail.tm per request.
func (s *AccountService) StartInboxSync(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		log.Println("inbox sync: disabled")
		return
	}

	go func() {
		for {
			s.syncAllInboxes(ctx)
			select {
			case <-ctx.Done():
				return
			case <-time.After(interval):
			}
		}
	}()
}

func (s *AccountService) syncAllInboxes(ctx context.Context) {
	var accounts []models.MailAccount
	if err := s.db.WithContext(ctx).Select("id", "email", "password").Find(&accounts).Error; err != nil {
		log.Printf("inbox sync: failed to load accounts: %v", err)
		return
	}

	failed := 0
	for _, account := range accounts {
		if ctx.Err() != nil {
			return
		}
		if err := s.syncInbox(ctx, &account); err != nil {
			failed++
			log.Printf("inbox sync: %s: %v", account.Email, err)
		}
		time.Sleep(syncAccountDelay)
	}
	log.Printf("inbox sync: refreshed %d/%d accounts", len(accounts)-failed, len(accounts))
}

func (s *AccountService) syncInbox(ctx context.Context, account *models.MailAccount) error {
	var firstPage *mailtm.MessagePage
	err := s.mailtm.WithToken(ctx, account.Email, account.Password, func(token string) error {
		var err error
		firstPage, err = s.mailtm.FetchInboxPage(ctx, token, 1)
		return err
	})
	if err != nil {
		return err
	}
	s.recordInboxActivity(ctx, account.ID, firstPage)
	return nil
}
