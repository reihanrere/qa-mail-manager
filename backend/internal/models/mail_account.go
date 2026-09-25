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

// MailAccount represents a Mail.tm mailbox managed for QA testing purposes.
type MailAccount struct {
	ID uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`

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

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
