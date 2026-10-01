package services

import (
	"context"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"qa-mail-manager/internal/models"
	"qa-mail-manager/internal/providers"
)

// InboxPage is one page of an account's inbox, newest message first.
type InboxPage struct {
	Messages []providers.MessageSummary
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
// InboxSearchMaxPages pages and returns every match at once.
func (s *AccountService) GetInbox(ctx context.Context, id uuid.UUID, page int, search string) (*InboxPage, error) {
	account, provider, err := s.accountWithProvider(ctx, id)
	if err != nil {
		return nil, err
	}
	if page < 1 {
		page = 1
	}

	search = strings.TrimSpace(search)
	if search != "" {
		maxPages := s.current().InboxSearchMaxPages
		// Providers that can search natively (the local database) skip the page scan
		if searcher, ok := provider.(providers.Searcher); ok {
			result, truncated, err := searcher.Search(ctx, account, search, maxPages*providers.MessagesPerPage)
			if err != nil {
				return nil, err
			}
			return &InboxPage{
				Messages: result,
				Meta:     InboxMeta{Page: 1, Limit: len(result), Total: len(result), Truncated: truncated},
			}, nil
		}
		return searchInbox(ctx, provider, account, search, maxPages)
	}

	result, err := provider.ListMessages(ctx, account, page)
	if err != nil {
		return nil, err
	}
	sortNewestFirst(result.Members)

	if page == 1 {
		s.recordInboxActivity(ctx, account, result)
	}

	return &InboxPage{
		Messages: result.Members,
		Meta: InboxMeta{
			Page:    page,
			Limit:   providers.MessagesPerPage,
			Total:   result.TotalItems,
			HasMore: page*providers.MessagesPerPage < result.TotalItems,
		},
	}, nil
}

// searchInbox scans the inbox page by page, since Mail.tm has no search API, stopping after maxPages.
func searchInbox(ctx context.Context, provider providers.MailProvider, account *models.MailAccount, search string, maxPages int) (*InboxPage, error) {
	term := strings.ToLower(search)
	matches := []providers.MessageSummary{}
	truncated := false

	for page := 1; ; page++ {
		result, err := provider.ListMessages(ctx, account, page)
		if err != nil {
			return nil, err
		}
		for _, m := range result.Members {
			if messageMatches(m, term) {
				matches = append(matches, m)
			}
		}
		if page*providers.MessagesPerPage >= result.TotalItems || len(result.Members) == 0 {
			break
		}
		if page == maxPages {
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

func messageMatches(m providers.MessageSummary, term string) bool {
	for _, field := range []string{m.Subject, m.Intro, m.From.Name, m.From.Address} {
		if strings.Contains(strings.ToLower(field), term) {
			return true
		}
	}
	return false
}

// sortNewestFirst orders messages by createdAt, newest first.
func sortNewestFirst(messages []providers.MessageSummary) {
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
// For Mail.tm a growing count means new mail, which is pushed to the UI; local accounts
// publish their own event when the ingest endpoint stores a message.
func (s *AccountService) recordInboxActivity(ctx context.Context, account *models.MailAccount, firstPage *providers.MessagePage) {
	var lastMessageAt *time.Time
	var newest providers.MessageSummary
	if len(firstPage.Members) > 0 {
		newest = firstPage.Members[0]
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
		Where("id = ?", account.ID).
		UpdateColumns(map[string]any{
			"last_message_at": lastMessageAt,
			"message_count":   firstPage.TotalItems,
		}).Error
	if err != nil {
		log.Printf("inbox sync: failed to record activity for %s: %v", account.ID, err)
		return
	}

	if firstPage.TotalItems > 0 && account.MessageCount == 0 && account.Status == models.StatusAvailable &&
		s.current().AutoMarkUsed == AutoMarkFirstMessage {
		if err := s.UpdateStatus(ctx, account.ID, models.StatusUsed); err != nil {
			log.Printf("auto mark used: %s: %v", account.Email, err)
		} else {
			account.Status = models.StatusUsed
		}
	}

	if account.Provider != providers.NameLocal && firstPage.TotalItems > account.MessageCount {
		s.events.Publish(Event{
			Type:         EventMessageCreated,
			AccountID:    account.ID.String(),
			AccountEmail: account.Email,
			Subject:      newest.Subject,
		})
	}
	account.MessageCount = firstPage.TotalItems
	account.LastMessageAt = lastMessageAt
}

// MarkMessageRead marks a message as seen on the account's provider.
func (s *AccountService) MarkMessageRead(ctx context.Context, id uuid.UUID, messageID string) error {
	account, provider, err := s.accountWithProvider(ctx, id)
	if err != nil {
		return err
	}
	return provider.MarkSeen(ctx, account, messageID)
}

// DeleteMessage permanently deletes a message on the account's provider, then refreshes
// the account's inbox activity so its message count and ranking stay accurate.
func (s *AccountService) DeleteMessage(ctx context.Context, id uuid.UUID, messageID string) error {
	account, provider, err := s.accountWithProvider(ctx, id)
	if err != nil {
		return err
	}
	if err := provider.Delete(ctx, account, messageID); err != nil {
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

// GetMessageDetail returns a single message's full body from the account's provider.
func (s *AccountService) GetMessageDetail(ctx context.Context, id uuid.UUID, messageID string) (*providers.MessageDetail, error) {
	account, provider, err := s.accountWithProvider(ctx, id)
	if err != nil {
		return nil, err
	}
	return provider.GetMessage(ctx, account, messageID)
}

// GetAttachment downloads one attachment of a message through the account's provider.
func (s *AccountService) GetAttachment(ctx context.Context, id uuid.UUID, messageID, attachmentID string) (*providers.File, error) {
	account, provider, err := s.accountWithProvider(ctx, id)
	if err != nil {
		return nil, err
	}
	return provider.GetAttachment(ctx, account, messageID, attachmentID)
}

// GetMessageSource returns the raw RFC 5322 message.
func (s *AccountService) GetMessageSource(ctx context.Context, id uuid.UUID, messageID string) (*providers.File, error) {
	account, provider, err := s.accountWithProvider(ctx, id)
	if err != nil {
		return nil, err
	}
	return provider.GetSource(ctx, account, messageID)
}

// accountWithProvider loads an account together with the provider that owns its mailbox.
func (s *AccountService) accountWithProvider(ctx context.Context, id uuid.UUID) (*models.MailAccount, providers.MailProvider, error) {
	account, err := s.getAccount(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	provider, err := s.providerFor(account)
	if err != nil {
		return nil, nil, err
	}
	return account, provider, nil
}

// settingsRecheckInterval is how often a disabled background job checks whether it was
// re-enabled from the Settings page.
const settingsRecheckInterval = time.Minute

// StartInboxSync refreshes every account's latest-message time until ctx ends, so the inbox
// can rank accounts by recent activity (and detect new Mail.tm mail) without polling
// providers per request. The interval is re-read every cycle, so Settings changes apply live.
func (s *AccountService) StartInboxSync(ctx context.Context) {
	go func() {
		for {
			wait := s.current().InboxSyncInterval
			if wait > 0 {
				s.syncAllInboxes(ctx)
			} else {
				wait = settingsRecheckInterval
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}
		}
	}()
}

func (s *AccountService) syncAllInboxes(ctx context.Context) {
	var accounts []models.MailAccount
	if err := s.db.WithContext(ctx).Select("id", "provider", "email", "password", "message_count", "status").Find(&accounts).Error; err != nil {
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
		// Only Mail.tm is rate limited (roughly 8 requests per second per IP); each account
		// costs one or two requests. Local inboxes are plain database reads.
		if account.Provider != providers.NameLocal {
			time.Sleep(s.current().MailTMRequestDelay)
		}
	}
	log.Printf("inbox sync: refreshed %d/%d accounts", len(accounts)-failed, len(accounts))
}

func (s *AccountService) syncInbox(ctx context.Context, account *models.MailAccount) error {
	provider, err := s.providerFor(account)
	if err != nil {
		return err
	}
	firstPage, err := provider.ListMessages(ctx, account, 1)
	if err != nil {
		return err
	}
	s.recordInboxActivity(ctx, account, firstPage)
	return nil
}
