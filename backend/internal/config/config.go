package config

import (
	"errors"
	"io/fs"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all application configuration loaded from environment/.env.
type Config struct {
	AppName string
	AppPort string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	MailTMBaseURL string
	// InboxSyncInterval controls how often every account's latest message is refreshed; 0 disables it.
	InboxSyncInterval time.Duration
}

// LoadConfig reads configuration from .env (if present) and the real environment.
func LoadConfig() (*Config, error) {
	viper.SetConfigFile(".env")
	viper.SetConfigType("env")
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.SetDefault("INBOX_SYNC_INTERVAL", "2m")

	// .env is optional: containers pass configuration as real environment variables.
	// SetConfigFile reports a missing file as fs.ErrNotExist, not ConfigFileNotFoundError.
	if err := viper.ReadInConfig(); err != nil {
		var notFound viper.ConfigFileNotFoundError
		if !errors.As(err, &notFound) && !errors.Is(err, fs.ErrNotExist) {
			return nil, err
		}
	}

	cfg := &Config{
		AppName:       viper.GetString("APP_NAME"),
		AppPort:       viper.GetString("APP_PORT"),
		DBHost:        viper.GetString("DB_HOST"),
		DBPort:        viper.GetString("DB_PORT"),
		DBUser:        viper.GetString("DB_USER"),
		DBPassword:    viper.GetString("DB_PASSWORD"),
		DBName:        viper.GetString("DB_NAME"),
		MailTMBaseURL: viper.GetString("MAILTM_BASE_URL"),

		InboxSyncInterval: viper.GetDuration("INBOX_SYNC_INTERVAL"),
	}

	return cfg, nil
}
