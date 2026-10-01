// Package providers abstracts the mail backends that own generated mailboxes,
// so Mail.tm and our own catch-all domain can be used side by side.
package providers

import (
	"context"
	"errors"

	"qa-mail-manager/internal/mailtm"
	"qa-mail-manager/internal/models"
)

// Provider names, stored in mail_accounts.provider.
const (
	NameMailTM = "mailtm"
	NameLocal  = "local"
)

// Message types shared by every provider. They alias the Mail.tm shapes so the
// JSON returned to the frontend is identical whichever provider owns the inbox.
type (
	MessageSummary = mailtm.MessageSummary
	MessagePage    = mailtm.MessagePage
	MessageDetail  = mailtm.MessageDetail
	Address        = mailtm.Address
	Attachment     = mailtm.Attachment
)

// File is a downloadable attachment or raw message source.
type File struct {
	Filename    string
	ContentType string
	Data        []byte
}

// MessagesPerPage is the inbox page size used by every provider.
const MessagesPerPage = mailtm.MessagesPerPage

// ErrAddressTaken means the address already exists on the provider; generate another.
var ErrAddressTaken = errors.New("address already taken")

// ErrMessageNotFound means the message id (or attachment id) does not exist in this account's inbox.
var ErrMessageNotFound = errors.New("message not found")

// MailProvider is a mail backend that can create mailboxes and read their messages.
type MailProvider interface {
	// Name returns the value stored in mail_accounts.provider.
	Name() string
	// Label is the human-readable name shown in the UI.
	Label() string
	// PickDomain returns the domain a new address is created on when none is requested.
	PickDomain(ctx context.Context) (string, error)
	// Domains lists every domain new addresses can be created on.
	Domains(ctx context.Context) ([]string, error)
	// CreateAddress registers the mailbox and returns its provider-side id.
	// It returns ErrAddressTaken when the address is already in use.
	CreateAddress(ctx context.Context, email, password string) (string, error)
	// ListMessages returns one page (1-based) of the inbox; order is not guaranteed.
	ListMessages(ctx context.Context, account *models.MailAccount, page int) (*MessagePage, error)
	GetMessage(ctx context.Context, account *models.MailAccount, messageID string) (*MessageDetail, error)
	MarkSeen(ctx context.Context, account *models.MailAccount, messageID string) error
	Delete(ctx context.Context, account *models.MailAccount, messageID string) error
	// GetAttachment returns one attachment of a message by its id from GetMessage.
	GetAttachment(ctx context.Context, account *models.MailAccount, messageID, attachmentID string) (*File, error)
	// GetSource returns the raw RFC 5322 message.
	GetSource(ctx context.Context, account *models.MailAccount, messageID string) (*File, error)
}

// Searcher is implemented by providers that can search an inbox natively. Others are
// searched by scanning pages. limit caps the results; truncated reports more matches.
type Searcher interface {
	Search(ctx context.Context, account *models.MailAccount, term string, limit int) (messages []MessageSummary, truncated bool, err error)
}
