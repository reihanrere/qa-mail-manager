package config

import (
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all application configuration loaded from environment/.env.
// Every tunable lives here with its default in LoadConfig, so behaviour can be
// changed through .env / docker-compose without touching code.
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
	// MailTMRequestDelay spaces out background syncs of Mail.tm accounts to respect its rate limit.
	MailTMRequestDelay time.Duration
	// InboxSearchMaxPages caps how many inbox pages a search scans.
	InboxSearchMaxPages int

	// MailProvider is the default provider for new accounts: "mailtm" or "local".
	MailProvider string
	// CatchallDomains are our own domains served by the "local" provider (comma-separated
	// CATCHALL_DOMAIN); empty disables generating there.
	CatchallDomains []string

	// IngestSecret authenticates the Cloudflare Email Worker; empty disables the ingest server.
	IngestSecret string
	// IngestPort is a separate listener exposing only the ingest endpoint, so the tunnel
	// never publishes the rest of the API.
	IngestPort string
	// IngestMaxBytes caps the size of one raw email accepted by the ingest endpoint.
	IngestMaxBytes int

	// MessageRetention deletes locally stored messages older than this; 0 keeps them forever.
	MessageRetention time.Duration
	// MessagePruneInterval is how often retention and account cleanup run.
	MessagePruneInterval time.Duration

	// AutoMarkUsed: off, first_message or otp_copied.
	AutoMarkUsed string
	// AccountCleanupAfter blocks/deletes accounts without mail for this long; 0 disables it.
	AccountCleanupAfter time.Duration
	// AccountCleanupAction: block or delete.
	AccountCleanupAction string

	// UsernameMaxAttempts bounds retries when a generated address is already taken.
	UsernameMaxAttempts int
	// BulkGenerateMax caps how many accounts one bulk generate may create.
	BulkGenerateMax int
	// UsernameFirstNames / UsernameLastNames override the built-in name pools when set.
	UsernameFirstNames []string
	UsernameLastNames  []string

	// LegacyUsernamePattern (Go regexp on the local part) flags accounts created with the
	// old, detectable naming scheme so they can be replaced; empty disables it.
	LegacyUsernamePattern string

	// Limits for the free-text labels attached to accounts (counted in characters).
	TagMaxLength  int
	NoteMaxLength int

	// SMTP server for sending and replying from own-domain accounts; empty host disables it.
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	// SMTPSecurity: starttls (587), tls (465) or none (local test servers only).
	SMTPSecurity string

	// EventsHeartbeatInterval keeps the live-update stream open through proxies.
	EventsHeartbeatInterval time.Duration
}

// LoadConfig reads configuration from .env (if present) and the real environment.
func LoadConfig() (*Config, error) {
	viper.SetConfigFile(".env")
	viper.SetConfigType("env")
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	viper.SetDefault("APP_NAME", "QA Mail Manager")
	viper.SetDefault("APP_PORT", "8080")
	viper.SetDefault("MAILTM_BASE_URL", "https://api.mail.tm")
	viper.SetDefault("INBOX_SYNC_INTERVAL", "2m")
	viper.SetDefault("MAILTM_REQUEST_DELAY", "400ms")
	viper.SetDefault("INBOX_SEARCH_MAX_PAGES", 10)
	viper.SetDefault("MAIL_PROVIDER", "mailtm")
	viper.SetDefault("INGEST_PORT", "8081")
	viper.SetDefault("INGEST_MAX_BYTES", 25<<20) // Cloudflare Email Routing's own message limit
	viper.SetDefault("MESSAGE_RETENTION", "720h")
	viper.SetDefault("MESSAGE_PRUNE_INTERVAL", "1h")
	viper.SetDefault("AUTO_MARK_USED", "off")
	viper.SetDefault("ACCOUNT_CLEANUP_AFTER", "0")
	viper.SetDefault("ACCOUNT_CLEANUP_ACTION", "block")
	viper.SetDefault("USERNAME_MAX_ATTEMPTS", 5)
	viper.SetDefault("BULK_GENERATE_MAX", 50)
	viper.SetDefault("TAG_MAX_LENGTH", 50)
	viper.SetDefault("NOTE_MAX_LENGTH", 500)
	viper.SetDefault("LEGACY_USERNAME_PATTERN", "^qa_test_")
	viper.SetDefault("EVENTS_HEARTBEAT_INTERVAL", "20s")
	viper.SetDefault("SMTP_PORT", 587)
	viper.SetDefault("SMTP_SECURITY", "starttls")

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

		InboxSyncInterval:   viper.GetDuration("INBOX_SYNC_INTERVAL"),
		MailTMRequestDelay:  viper.GetDuration("MAILTM_REQUEST_DELAY"),
		InboxSearchMaxPages: viper.GetInt("INBOX_SEARCH_MAX_PAGES"),

		MailProvider:    strings.ToLower(strings.TrimSpace(viper.GetString("MAIL_PROVIDER"))),
		CatchallDomains: SplitList(viper.GetString("CATCHALL_DOMAIN")),

		IngestSecret:   viper.GetString("INGEST_SECRET"),
		IngestPort:     viper.GetString("INGEST_PORT"),
		IngestMaxBytes: viper.GetInt("INGEST_MAX_BYTES"),

		MessageRetention:     viper.GetDuration("MESSAGE_RETENTION"),
		MessagePruneInterval: viper.GetDuration("MESSAGE_PRUNE_INTERVAL"),

		AutoMarkUsed:         strings.ToLower(strings.TrimSpace(viper.GetString("AUTO_MARK_USED"))),
		AccountCleanupAfter:  viper.GetDuration("ACCOUNT_CLEANUP_AFTER"),
		AccountCleanupAction: strings.ToLower(strings.TrimSpace(viper.GetString("ACCOUNT_CLEANUP_ACTION"))),

		UsernameMaxAttempts: viper.GetInt("USERNAME_MAX_ATTEMPTS"),
		BulkGenerateMax:     viper.GetInt("BULK_GENERATE_MAX"),
		UsernameFirstNames:  SplitList(viper.GetString("USERNAME_FIRST_NAMES")),
		UsernameLastNames:   SplitList(viper.GetString("USERNAME_LAST_NAMES")),

		LegacyUsernamePattern: strings.TrimSpace(viper.GetString("LEGACY_USERNAME_PATTERN")),

		TagMaxLength:  viper.GetInt("TAG_MAX_LENGTH"),
		NoteMaxLength: viper.GetInt("NOTE_MAX_LENGTH"),

		EventsHeartbeatInterval: viper.GetDuration("EVENTS_HEARTBEAT_INTERVAL"),

		SMTPHost:     strings.TrimSpace(viper.GetString("SMTP_HOST")),
		SMTPPort:     viper.GetInt("SMTP_PORT"),
		SMTPUsername: viper.GetString("SMTP_USERNAME"),
		SMTPPassword: viper.GetString("SMTP_PASSWORD"),
		SMTPSecurity: strings.ToLower(strings.TrimSpace(viper.GetString("SMTP_SECURITY"))),
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// Validate rejects values that would make the app misbehave instead of failing later.
func (c *Config) Validate() error {
	var problems []string
	positive := map[string]int{
		"INBOX_SEARCH_MAX_PAGES": c.InboxSearchMaxPages,
		"INGEST_MAX_BYTES":       c.IngestMaxBytes,
		"USERNAME_MAX_ATTEMPTS":  c.UsernameMaxAttempts,
		"BULK_GENERATE_MAX":      c.BulkGenerateMax,
		"TAG_MAX_LENGTH":         c.TagMaxLength,
		"NOTE_MAX_LENGTH":        c.NoteMaxLength,
	}
	for name, value := range positive {
		if value <= 0 {
			problems = append(problems, fmt.Sprintf("%s must be greater than 0", name))
		}
	}
	if c.MailTMRequestDelay < 0 || c.MessageRetention < 0 || c.InboxSyncInterval < 0 {
		problems = append(problems, "durations must not be negative")
	}
	// Retention can be switched on later from the Settings page, so the prune
	// interval must always be usable
	if c.MessagePruneInterval <= 0 {
		problems = append(problems, "MESSAGE_PRUNE_INTERVAL must be greater than 0")
	}
	if c.EventsHeartbeatInterval <= 0 {
		problems = append(problems, "EVENTS_HEARTBEAT_INTERVAL must be greater than 0")
	}
	switch c.SMTPSecurity {
	case "starttls", "tls", "none":
	default:
		problems = append(problems, "SMTP_SECURITY must be starttls, tls or none")
	}
	if c.SMTPHost != "" && (c.SMTPPort <= 0 || c.SMTPPort > 65535) {
		problems = append(problems, "SMTP_PORT must be a valid port")
	}
	if _, err := regexp.Compile(c.LegacyUsernamePattern); err != nil {
		problems = append(problems, "LEGACY_USERNAME_PATTERN is not a valid regular expression")
	}
	if c.IngestSecret != "" && len(c.IngestSecret) < 32 {
		problems = append(problems, "INGEST_SECRET must be at least 32 characters")
	}
	if c.IngestSecret != "" && c.IngestPort == c.AppPort {
		problems = append(problems, "INGEST_PORT must differ from APP_PORT")
	}
	if len(problems) > 0 {
		sort.Strings(problems) // map iteration order is random
		return fmt.Errorf("invalid configuration: %s", strings.Join(problems, "; "))
	}
	return nil
}

// SplitList parses a comma-separated env value into trimmed, lower-cased, non-empty items.
func SplitList(value string) []string {
	var items []string
	for _, part := range strings.Split(value, ",") {
		if item := strings.ToLower(strings.TrimSpace(part)); item != "" {
			items = append(items, item)
		}
	}
	return items
}
