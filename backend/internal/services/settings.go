package services

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"qa-mail-manager/internal/models"
)

// Limits for the free-text labels users attach to accounts (counted in characters).
type Limits struct {
	TagMaxLength  int `json:"tagMaxLength"`
	NoteMaxLength int `json:"noteMaxLength"`
}

// Settings are the tunables AccountService runs with. The environment (config.Config)
// provides the defaults; fields listed in editableFields can be overridden at runtime
// from the Settings page and are persisted in setting_overrides.
type Settings struct {
	DefaultProvider string
	Limits          Limits

	UsernameMaxAttempts int
	// BulkGenerateMax caps how many accounts one bulk generate may create.
	BulkGenerateMax int
	// FirstNames / LastNames replace the built-in name pools when non-empty.
	FirstNames []string
	LastNames  []string
	// LegacyUsernamePattern flags accounts created with the old, detectable naming scheme.
	LegacyUsernamePattern string

	InboxSearchMaxPages int
	InboxSyncInterval   time.Duration
	MailTMRequestDelay  time.Duration

	MessageRetention     time.Duration
	MessagePruneInterval time.Duration

	// AutoMarkUsed moves AVAILABLE accounts to USED automatically: AutoMarkOff,
	// AutoMarkFirstMessage (when the first email arrives) or AutoMarkOTPCopied (the UI
	// marks it when an OTP or verification link is copied).
	AutoMarkUsed string
	// AccountCleanupAfter acts on accounts without mail for this long; 0 disables it.
	AccountCleanupAfter time.Duration
	// AccountCleanupAction is CleanupBlock or CleanupDelete.
	AccountCleanupAction string

	// IngestEnabled is reported to the UI; the ingest server itself is started in main.
	IngestEnabled bool
}

// AutoMarkUsed modes.
const (
	AutoMarkOff          = "off"
	AutoMarkFirstMessage = "first_message"
	AutoMarkOTPCopied    = "otp_copied"
)

// Account cleanup actions.
const (
	CleanupBlock  = "block"
	CleanupDelete = "delete"
)

func (s Settings) validate() error {
	switch {
	case s.Limits.TagMaxLength <= 0 || s.Limits.NoteMaxLength <= 0:
		return mustBePositive("tagMaxLength", "tag and note limits")
	case s.UsernameMaxAttempts <= 0:
		return mustBePositive("usernameMaxAttempts", "username max attempts")
	case s.BulkGenerateMax <= 0:
		return mustBePositive("bulkGenerateMax", "bulk generate max")
	case s.InboxSearchMaxPages <= 0:
		return mustBePositive("inboxSearchMaxPages", "inbox search max pages")
	case s.MessagePruneInterval <= 0:
		return mustBePositive("messagePruneInterval", "message prune interval")
	case s.InboxSyncInterval < 0 || s.MailTMRequestDelay < 0 || s.MessageRetention < 0 || s.AccountCleanupAfter < 0:
		return invalid("setting_negative_duration", nil, "durations must not be negative")
	}
	switch s.AutoMarkUsed {
	case AutoMarkOff, AutoMarkFirstMessage, AutoMarkOTPCopied:
	default:
		return invalid("invalid_setting_value", map[string]any{"key": "autoMarkUsed"},
			"auto mark used must be %s, %s or %s", AutoMarkOff, AutoMarkFirstMessage, AutoMarkOTPCopied)
	}
	switch s.AccountCleanupAction {
	case CleanupBlock, CleanupDelete:
	default:
		return invalid("invalid_setting_value", map[string]any{"key": "accountCleanupAction"},
			"account cleanup action must be %s or %s", CleanupBlock, CleanupDelete)
	}
	if _, err := regexp.Compile(s.LegacyUsernamePattern); err != nil {
		return invalid("invalid_pattern", map[string]any{"key": "legacyUsernamePattern"}, "legacy username pattern: %v", err)
	}
	return nil
}

func mustBePositive(key, name string) error {
	return invalid("setting_not_positive", map[string]any{"key": key}, "%s must be greater than 0", name)
}

// editableField maps one Settings field to the key used by the API and the overrides table.
type editableField struct {
	key   string
	get   func(Settings) any
	apply func(*Settings, json.RawMessage) error
}

func intField(key string, ptr func(*Settings) *int) editableField {
	return editableField{
		key: key,
		get: func(s Settings) any { return *ptr(&s) },
		apply: func(s *Settings, raw json.RawMessage) error {
			return json.Unmarshal(raw, ptr(s))
		},
	}
}

func durationField(key string, ptr func(*Settings) *time.Duration) editableField {
	return editableField{
		key: key,
		get: func(s Settings) any { return ptr(&s).String() },
		apply: func(s *Settings, raw json.RawMessage) error {
			var text string
			if err := json.Unmarshal(raw, &text); err != nil {
				return err
			}
			d, err := time.ParseDuration(strings.TrimSpace(text))
			if err != nil {
				return err
			}
			*ptr(s) = d
			return nil
		},
	}
}

func stringField(key string, ptr func(*Settings) *string, normalize func(string) string) editableField {
	return editableField{
		key: key,
		get: func(s Settings) any { return *ptr(&s) },
		apply: func(s *Settings, raw json.RawMessage) error {
			var text string
			if err := json.Unmarshal(raw, &text); err != nil {
				return err
			}
			*ptr(s) = normalize(text)
			return nil
		},
	}
}

func listField(key string, ptr func(*Settings) *[]string) editableField {
	return editableField{
		key: key,
		get: func(s Settings) any {
			if list := *ptr(&s); list != nil {
				return list
			}
			return []string{}
		},
		apply: func(s *Settings, raw json.RawMessage) error {
			var list []string
			if err := json.Unmarshal(raw, &list); err != nil {
				return err
			}
			cleaned := []string{}
			for _, item := range list {
				if item = normalizeKeyword(item); item != "" {
					cleaned = append(cleaned, item)
				}
			}
			*ptr(s) = cleaned
			return nil
		},
	}
}

// editableFields are the settings the Settings page may change. Secrets, ports, the
// catch-all domain and the ingest switch stay environment-only.
var editableFields = []editableField{
	stringField("defaultProvider", func(s *Settings) *string { return &s.DefaultProvider }, normalizeKeyword),
	intField("tagMaxLength", func(s *Settings) *int { return &s.Limits.TagMaxLength }),
	intField("noteMaxLength", func(s *Settings) *int { return &s.Limits.NoteMaxLength }),
	intField("usernameMaxAttempts", func(s *Settings) *int { return &s.UsernameMaxAttempts }),
	intField("bulkGenerateMax", func(s *Settings) *int { return &s.BulkGenerateMax }),
	listField("usernameFirstNames", func(s *Settings) *[]string { return &s.FirstNames }),
	listField("usernameLastNames", func(s *Settings) *[]string { return &s.LastNames }),
	stringField("legacyUsernamePattern", func(s *Settings) *string { return &s.LegacyUsernamePattern }, strings.TrimSpace),
	intField("inboxSearchMaxPages", func(s *Settings) *int { return &s.InboxSearchMaxPages }),
	durationField("inboxSyncInterval", func(s *Settings) *time.Duration { return &s.InboxSyncInterval }),
	durationField("mailtmRequestDelay", func(s *Settings) *time.Duration { return &s.MailTMRequestDelay }),
	durationField("messageRetention", func(s *Settings) *time.Duration { return &s.MessageRetention }),
	stringField("autoMarkUsed", func(s *Settings) *string { return &s.AutoMarkUsed }, normalizeKeyword),
	durationField("accountCleanupAfter", func(s *Settings) *time.Duration { return &s.AccountCleanupAfter }),
	stringField("accountCleanupAction", func(s *Settings) *string { return &s.AccountCleanupAction }, normalizeKeyword),
}

func normalizeKeyword(v string) string { return strings.ToLower(strings.TrimSpace(v)) }

func findField(key string) (editableField, bool) {
	for _, f := range editableFields {
		if f.key == key {
			return f, true
		}
	}
	return editableField{}, false
}

func editableValues(s Settings) map[string]any {
	values := make(map[string]any, len(editableFields))
	for _, f := range editableFields {
		values[f.key] = f.get(s)
	}
	return values
}

// applyOverrides layers stored overrides on top of the environment baseline.
// Unknown keys (e.g. from an older version) are ignored.
func applyOverrides(base Settings, overrides map[string]string) (Settings, error) {
	result := base
	for key, value := range overrides {
		field, ok := findField(key)
		if !ok {
			continue
		}
		if err := field.apply(&result, json.RawMessage(value)); err != nil {
			return base, invalid("invalid_setting_value", map[string]any{"key": key}, "%s: %v", key, err)
		}
	}
	return result, nil
}

// current returns a copy of the effective settings.
func (s *AccountService) current() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

// setEffective swaps in new settings and rebuilds what depends on them.
func (s *AccountService) setEffective(settings Settings) {
	usernames := newUsernameGenerator(settings.FirstNames, settings.LastNames)
	legacy := regexp.MustCompile(settings.LegacyUsernamePattern) // validated before
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
	s.usernames = usernames
	s.legacyPattern = legacy
}

func (s *AccountService) validateSettings(settings Settings) error {
	if err := settings.validate(); err != nil {
		return err
	}
	if _, ok := s.providers[settings.DefaultProvider]; !ok {
		return invalid("unknown_provider", map[string]any{"provider": settings.DefaultProvider},
			"unknown default mail provider %q", settings.DefaultProvider)
	}
	return nil
}

func (s *AccountService) loadOverrides(ctx context.Context) (map[string]string, error) {
	var rows []models.SettingOverride
	if err := s.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to load setting overrides: %w", err)
	}
	overrides := make(map[string]string, len(rows))
	for _, row := range rows {
		overrides[row.Key] = row.Value
	}
	return overrides, nil
}

// LoadSettingOverrides applies the overrides saved from the Settings page. When they no
// longer validate (e.g. the default provider was removed) an error is returned and the
// environment defaults stay in effect, so the app still starts.
func (s *AccountService) LoadSettingOverrides(ctx context.Context) error {
	overrides, err := s.loadOverrides(ctx)
	if err != nil {
		return err
	}
	effective, err := applyOverrides(s.baseline, overrides)
	if err == nil {
		err = s.validateSettings(effective)
	}
	if err != nil {
		return fmt.Errorf("ignoring saved settings: %w", err)
	}
	s.setEffective(effective)
	return nil
}

// SettingsPatch changes editable settings: Values sets keys, Reset returns keys to
// their environment defaults.
type SettingsPatch struct {
	Values map[string]json.RawMessage `json:"values"`
	Reset  []string                   `json:"reset"`
}

// UpdateSettings validates the patch against the full resulting settings, persists it
// and applies it immediately.
func (s *AccountService) UpdateSettings(ctx context.Context, patch SettingsPatch) error {
	if len(patch.Values) == 0 && len(patch.Reset) == 0 {
		return invalid("nothing_to_change", nil, "nothing to change")
	}
	for key := range patch.Values {
		if _, ok := findField(key); !ok {
			return invalid("unknown_setting", map[string]any{"key": key}, "%q is not an editable setting", key)
		}
	}
	for _, key := range patch.Reset {
		if _, ok := findField(key); !ok {
			return invalid("unknown_setting", map[string]any{"key": key}, "%q is not an editable setting", key)
		}
	}

	overrides, err := s.loadOverrides(ctx)
	if err != nil {
		return err
	}
	for _, key := range patch.Reset {
		delete(overrides, key)
	}
	for key, raw := range patch.Values {
		overrides[key] = string(raw)
	}
	effective, err := applyOverrides(s.baseline, overrides)
	if err != nil {
		return err
	}
	if err := s.validateSettings(effective); err != nil {
		return err
	}

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if len(patch.Reset) > 0 {
			if err := tx.Where("key IN ?", patch.Reset).Delete(&models.SettingOverride{}).Error; err != nil {
				return err
			}
		}
		for key, raw := range patch.Values {
			row := models.SettingOverride{Key: key, Value: string(raw), UpdatedAt: time.Now()}
			err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "key"}},
				DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
			}).Create(&row).Error
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to save settings: %w", err)
	}
	s.setEffective(effective)
	s.events.Publish(Event{Type: EventSettingsChanged})
	return nil
}

// ProviderStatus describes one provider for the settings page and the generate dialog.
type ProviderStatus struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	// Domain is the first of Domains, kept for simple displays.
	Domain    string   `json:"domain,omitempty"`
	Domains   []string `json:"domains,omitempty"`
	Available bool     `json:"available"`
	// Error explains why the provider cannot generate accounts right now.
	Error string `json:"error,omitempty"`
}

// AppSettings is the runtime configuration exposed at GET /api/settings.
type AppSettings struct {
	DefaultProvider string           `json:"defaultProvider"`
	Providers       []ProviderStatus `json:"providers"`
	Limits          Limits           `json:"limits"`
	Inbox           InboxSettings    `json:"inbox"`
	// Editable holds the current value of every setting the Settings page can change,
	// Defaults their environment values, and Overridden the keys changed from the UI.
	Editable   map[string]any `json:"editable"`
	Defaults   map[string]any `json:"defaults"`
	Overridden []string       `json:"overridden"`
}

// InboxSettings summarises how inboxes are synced, searched and retained.
type InboxSettings struct {
	SyncInterval     string `json:"syncInterval"`
	SearchMaxPages   int    `json:"searchMaxPages"`
	MessageRetention string `json:"messageRetention"`
	IngestEnabled    bool   `json:"ingestEnabled"`
	// SendingEnabled is true when SMTP is configured, so replies can be sent.
	SendingEnabled bool `json:"sendingEnabled"`
}

// providerDomainTimeout bounds the domain lookup per provider so a slow Mail.tm
// cannot stall the settings endpoint.
const providerDomainTimeout = 5 * time.Second

// AppSettings reports the configured providers (with their current domain), limits and
// the editable settings.
func (s *AccountService) AppSettings(ctx context.Context) (AppSettings, error) {
	settings := s.current()

	names := make([]string, 0, len(s.providers))
	for name := range s.providers {
		names = append(names, name)
	}
	sort.Strings(names)

	statuses := make([]ProviderStatus, 0, len(names))
	for _, name := range names {
		p := s.providers[name]
		status := ProviderStatus{Name: name, Label: p.Label()}
		domainCtx, cancel := context.WithTimeout(ctx, providerDomainTimeout)
		domains, err := p.Domains(domainCtx)
		cancel()
		if err != nil {
			status.Error = err.Error()
		} else {
			status.Domains = domains
			status.Domain = domains[0]
			status.Available = true
		}
		statuses = append(statuses, status)
	}

	overridden := []string{}
	if s.db != nil {
		overrides, err := s.loadOverrides(ctx)
		if err != nil {
			return AppSettings{}, err
		}
		for key := range overrides {
			if _, ok := findField(key); ok {
				overridden = append(overridden, key)
			}
		}
		sort.Strings(overridden)
	}

	return AppSettings{
		DefaultProvider: settings.DefaultProvider,
		Providers:       statuses,
		Limits:          settings.Limits,
		Inbox: InboxSettings{
			SyncInterval:     durationLabel(settings.InboxSyncInterval),
			SearchMaxPages:   settings.InboxSearchMaxPages,
			MessageRetention: durationLabel(settings.MessageRetention),
			IngestEnabled:    settings.IngestEnabled,
			SendingEnabled:   s.SendingEnabled(),
		},
		Editable:   editableValues(settings),
		Defaults:   editableValues(s.baseline),
		Overridden: overridden,
	}, nil
}

// durationLabel renders 0 as "disabled" so the UI does not show "0s".
func durationLabel(d time.Duration) string {
	if d <= 0 {
		return "disabled"
	}
	return d.String()
}
