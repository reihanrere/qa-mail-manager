package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"qa-mail-manager/internal/ingest"
	"qa-mail-manager/internal/models"
	"qa-mail-manager/internal/providers"
)

// ErrRecipientNotFound means no local-provider account matches the email's recipient,
// so the Worker can reject the message instead of storing it.
var ErrRecipientNotFound = errors.New("no local account for recipient")

// IngestResult tells the caller what happened to an incoming email.
type IngestResult struct {
	AccountEmail string `json:"accountEmail"`
	MessageID    string `json:"messageId"`
	Duplicate    bool   `json:"duplicate"`
}

// IngestMessage stores a raw email for the local-provider account it was sent to.
// envelopeTo is the SMTP recipient reported by Cloudflare; when empty the To/Cc/
// Delivered-To headers are used instead.
func (s *AccountService) IngestMessage(ctx context.Context, raw []byte, envelopeTo string) (*IngestResult, error) {
	email, err := ingest.Parse(raw)
	if err != nil {
		return nil, err
	}

	// The envelope recipient is authoritative: headers may list addresses the message
	// was not delivered to (or miss BCC). Headers are only a fallback without it.
	candidates := email.Recipients
	if to := strings.ToLower(strings.TrimSpace(envelopeTo)); to != "" {
		candidates = []string{to}
	}
	account, err := s.findLocalAccount(ctx, candidates)
	if err != nil {
		return nil, err
	}

	message := &models.Message{
		AccountID:   account.ID,
		MessageID:   email.MessageID,
		FromName:    email.FromName,
		FromAddress: email.FromAddress,
		ToAddress:   account.Email,
		Subject:     email.Subject,
		Text:        email.Text,
		HTML:        email.HTML,
		Raw:         raw,
		Attachments: attachmentMeta(email.Attachments),
		CreatedAt:   time.Now(),
	}
	if err := s.db.WithContext(ctx).Create(message).Error; err != nil {
		// Cloudflare retries deliveries; the unique (account_id, message_id) index rejects
		// the copy, and the stored original is reported instead
		if isUniqueViolation(err) {
			var existing models.Message
			if s.db.WithContext(ctx).Select("id").
				First(&existing, "account_id = ? AND message_id = ?", account.ID, email.MessageID).Error == nil {
				return &IngestResult{AccountEmail: account.Email, MessageID: existing.ID.String(), Duplicate: true}, nil
			}
		}
		return nil, fmt.Errorf("failed to store message: %w", err)
	}

	// Keep the account's message count and latest-message ranking current
	if err := s.syncInbox(ctx, account); err != nil {
		log.Printf("ingest: failed to refresh activity for %s: %v", account.Email, err)
	}
	s.events.Publish(Event{
		Type:         EventMessageCreated,
		AccountID:    account.ID.String(),
		AccountEmail: account.Email,
		Subject:      email.Subject,
	})
	return &IngestResult{AccountEmail: account.Email, MessageID: message.ID.String()}, nil
}

// isUniqueViolation reports PostgreSQL error 23505 (unique_violation).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func attachmentMeta(list []ingest.Attachment) models.MessageAttachmentList {
	meta := make(models.MessageAttachmentList, 0, len(list))
	for _, a := range list {
		meta = append(meta, models.MessageAttachment{Index: a.Index, Filename: a.Filename, ContentType: a.ContentType, Size: a.Size, ContentID: a.ContentID})
	}
	return meta
}

// findLocalAccount returns the first local-provider account matching the candidates, in order.
func (s *AccountService) findLocalAccount(ctx context.Context, candidates []string) (*models.MailAccount, error) {
	if len(candidates) == 0 {
		return nil, ErrRecipientNotFound
	}
	var accounts []models.MailAccount
	err := s.db.WithContext(ctx).
		Where("provider = ? AND email IN ?", providers.NameLocal, candidates).
		Find(&accounts).Error
	if err != nil {
		return nil, fmt.Errorf("failed to look up recipient: %w", err)
	}
	for _, candidate := range candidates {
		for i := range accounts {
			if strings.EqualFold(accounts[i].Email, candidate) {
				return &accounts[i], nil
			}
		}
	}
	return nil, ErrRecipientNotFound
}

// cleanupInactiveAccounts blocks or deletes accounts without mail (or, if they never got
// any, created) longer ago than AccountCleanupAfter.
func (s *AccountService) cleanupInactiveAccounts(ctx context.Context, settings Settings) {
	if settings.AccountCleanupAfter <= 0 {
		return
	}
	cutoff := time.Now().Add(-settings.AccountCleanupAfter)
	inactive := s.db.WithContext(ctx).Model(&models.MailAccount{}).
		Where("COALESCE(last_message_at, created_at) < ?", cutoff)

	var result *gorm.DB
	if settings.AccountCleanupAction == CleanupDelete {
		result = inactive.Delete(&models.MailAccount{})
	} else {
		result = inactive.Where("status <> ?", models.StatusBlocked).Update("status", models.StatusBlocked)
	}
	if result.Error != nil {
		log.Printf("account cleanup: %v", result.Error)
		return
	}
	if result.RowsAffected > 0 {
		log.Printf("account cleanup: %s %d accounts inactive since %s", settings.AccountCleanupAction, result.RowsAffected, cutoff.Format(time.RFC3339))
		s.events.Publish(Event{Type: EventAccountsChanged})
	}
}

// StartMessagePruner runs account cleanup and deletes stored messages older than
// MessageRetention on every MessagePruneInterval until ctx ends. A zero retention keeps
// messages; settings are re-read every cycle so changes from the Settings page apply live.
func (s *AccountService) StartMessagePruner(ctx context.Context) {
	go func() {
		for {
			settings := s.current()
			s.cleanupInactiveAccounts(ctx, settings)
			if retention := settings.MessageRetention; retention > 0 {
				cutoff := time.Now().Add(-retention)
				result := s.db.WithContext(ctx).Where("created_at < ?", cutoff).Delete(&models.Message{})
				if result.Error != nil {
					log.Printf("message retention: %v", result.Error)
				} else if result.RowsAffected > 0 {
					log.Printf("message retention: deleted %d messages older than %s", result.RowsAffected, retention)
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(settings.MessagePruneInterval):
			}
		}
	}()
}
