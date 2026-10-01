package database

import (
	"fmt"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"qa-mail-manager/internal/config"
	"qa-mail-manager/internal/models"
)

// Connect opens a GORM/PostgreSQL connection and runs auto-migration.
func Connect(cfg *config.Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	if err := Migrate(db); err != nil {
		return nil, err
	}

	return db, nil
}

// Migrate creates or updates the schema. It is idempotent and runs on every start.
func Migrate(db *gorm.DB) error {
	if err := db.AutoMigrate(&models.MailAccount{}, &models.Message{}, &models.SettingOverride{}); err != nil {
		return fmt.Errorf("failed to auto-migrate database: %w", err)
	}

	// One stored copy per Message-ID and account, enforced by the database so concurrent
	// retries from Cloudflare cannot both insert. Older duplicates are removed first.
	statements := []string{
		`DELETE FROM messages a USING messages b
		 WHERE a.message_id <> '' AND a.account_id = b.account_id AND a.message_id = b.message_id
		   AND (a.created_at, a.id) > (b.created_at, b.id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_account_message_id
		 ON messages (account_id, message_id) WHERE message_id <> ''`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return fmt.Errorf("failed to migrate messages index: %w", err)
		}
	}
	return nil
}
