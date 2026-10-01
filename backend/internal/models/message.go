package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Message is an email received for a "local" provider account. Mail.tm accounts
// keep their messages on Mail.tm and are read live, so they never use this table.
type Message struct {
	ID uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`

	AccountID uuid.UUID    `gorm:"type:uuid;not null;index:idx_messages_account_created,priority:1" json:"accountId"`
	Account   *MailAccount `gorm:"constraint:OnDelete:CASCADE" json:"-"`

	// MessageID is the RFC 5322 Message-ID header, kept for de-duplication and debugging.
	MessageID   string `json:"messageId"`
	FromName    string `json:"fromName"`
	FromAddress string `json:"fromAddress"`
	ToAddress   string `json:"toAddress"`
	Subject     string `json:"subject"`
	Text        string `json:"text"`
	HTML        string `json:"html"`
	Seen        bool   `gorm:"not null;default:false" json:"seen"`

	// Raw is the original RFC 5322 message: the source view and attachment downloads
	// are served from it. Excluded from list queries because it can be megabytes.
	Raw         []byte                `gorm:"type:bytea" json:"-"`
	Attachments MessageAttachmentList `gorm:"type:jsonb;not null;default:'[]'" json:"attachments"`

	CreatedAt time.Time `gorm:"index:idx_messages_account_created,priority:2" json:"createdAt"`
}

// MessageAttachment is the metadata of one attachment; the content stays in Raw.
// Index is the 1-based position among the message's attachments and acts as its id.
type MessageAttachment struct {
	Index       int    `json:"index"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int    `json:"size"`
	ContentID   string `json:"contentId,omitempty"`
}

// MessageAttachmentList is stored as a JSON array.
type MessageAttachmentList []MessageAttachment

// Value encodes the list for the jsonb column.
func (l MessageAttachmentList) Value() (driver.Value, error) {
	if l == nil {
		return "[]", nil
	}
	b, err := json.Marshal(l)
	return string(b), err
}

// Scan decodes the jsonb column.
func (l *MessageAttachmentList) Scan(value any) error {
	switch v := value.(type) {
	case nil:
		*l = MessageAttachmentList{}
		return nil
	case []byte:
		return json.Unmarshal(v, l)
	case string:
		return json.Unmarshal([]byte(v), l)
	default:
		return errors.New("unsupported type for MessageAttachmentList")
	}
}
