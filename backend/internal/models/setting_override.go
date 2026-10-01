package models

import "time"

// SettingOverride stores a value changed from the Settings page. It takes precedence
// over the environment default until it is reset (deleted).
type SettingOverride struct {
	Key string `gorm:"primaryKey" json:"key"`
	// Value is the JSON encoding of the setting, e.g. `50`, `"720h0m0s"` or `["budi","sari"]`.
	Value     string    `gorm:"not null" json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}
