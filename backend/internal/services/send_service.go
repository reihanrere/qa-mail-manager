package services

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"qa-mail-manager/internal/mailer"
	"qa-mail-manager/internal/models"
	"qa-mail-manager/internal/providers"
)

// Limits for outgoing mail written in the UI.
const (
	maxSendRecipients = 10
	maxSubjectLength  = 300
	maxBodyLength     = 50_000
)

// SendMessageInput is an email written from an account. ReplyTo is the id of a message in
// the account's inbox; it threads the reply with In-Reply-To/References.
type SendMessageInput struct {
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text"`
	ReplyTo string   `json:"replyTo"`
}

// SendResult reports the Message-ID the email went out with.
type SendResult struct {
	MessageID string   `json:"messageId"`
	From      string   `json:"from"`
	To        []string `json:"to"`
}

// SetMailer enables sending; without it SendMessage returns mailer.ErrDisabled.
func (s *AccountService) SetMailer(m *mailer.Mailer) { s.mailer = m }

// SendingEnabled reports whether an SMTP server is configured.
func (s *AccountService) SendingEnabled() bool { return s.mailer.Enabled() }

// SendMessage sends a plain-text email from a local-provider account. Mail.tm accounts
// cannot send: their domain is not ours, so mail from it would be spoofed.
func (s *AccountService) SendMessage(ctx context.Context, id uuid.UUID, input SendMessageInput) (*SendResult, error) {
	if !s.mailer.Enabled() {
		return nil, fmt.Errorf("%w: %v", ErrInvalidInput, mailer.ErrDisabled)
	}
	account, err := s.getAccount(ctx, id)
	if err != nil {
		return nil, err
	}
	if account.Provider != providers.NameLocal {
		return nil, fmt.Errorf("%w: only own-domain accounts can send email", ErrInvalidInput)
	}

	input.Subject = strings.TrimSpace(input.Subject)
	if len(input.To) == 0 || len(input.To) > maxSendRecipients {
		return nil, fmt.Errorf("%w: between 1 and %d recipients are required", ErrInvalidInput, maxSendRecipients)
	}
	for _, to := range input.To {
		if _, err := mail.ParseAddress(to); err != nil {
			return nil, fmt.Errorf("%w: invalid recipient %q", ErrInvalidInput, to)
		}
	}
	if utf8.RuneCountInString(input.Subject) > maxSubjectLength || utf8.RuneCountInString(input.Text) > maxBodyLength {
		return nil, fmt.Errorf("%w: subject or body is too long", ErrInvalidInput)
	}

	var inReplyTo string
	if input.ReplyTo != "" {
		messageID, err := uuid.Parse(input.ReplyTo)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid replyTo", ErrInvalidInput)
		}
		var original models.Message
		err = s.db.WithContext(ctx).Select("message_id").
			First(&original, "id = ? AND account_id = ?", messageID, account.ID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, providers.ErrMessageNotFound
		}
		if err != nil {
			return nil, fmt.Errorf("failed to load original message: %w", err)
		}
		inReplyTo = original.MessageID
	}

	sentID, err := s.mailer.Send(ctx, mailer.Message{
		From:      account.Email,
		To:        input.To,
		Subject:   input.Subject,
		Text:      input.Text,
		InReplyTo: inReplyTo,
	})
	if err != nil {
		return nil, err
	}
	return &SendResult{MessageID: sentID, From: account.Email, To: input.To}, nil
}
