package models

import (
	"time"

	"github.com/google/uuid"
)

// Account status values.
const (
	StatusAvailable = "AVAILABLE"
	StatusUsed      = "USED"
	StatusBlocked   = "BLOCKED"
)

// MailAccount represents a mailbox managed for QA testing purposes.
type MailAccount struct {
	ID uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`

	// Provider names the mail backend that owns this mailbox ("mailtm" or "local").
	// Rows created before providers existed default to "mailtm".
	Provider string `gorm:"not null;default:mailtm;index" json:"provider"`

	AccountID string `gorm:"uniqueIndex" json:"accountId"`
	Email     string `gorm:"uniqueIndex;not null" json:"email"`
	Password  string `gorm:"not null" json:"-"`
	Domain    string `gorm:"not null" json:"domain"`

	Status string `gorm:"default:AVAILABLE" json:"status"`

	Tag  string `json:"tag"`
	Note string `json:"note"`

	// Inbox activity, refreshed by the background sync and whenever the inbox is read.
	LastMessageAt *time.Time `gorm:"index" json:"lastMessageAt"`
	MessageCount  int        `gorm:"default:0" json:"messageCount"`

	// LegacyName is computed (not stored): the address matches the old, detectable
	// naming pattern and should be replaced.
	LegacyName bool `gorm:"-" json:"legacyName"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
