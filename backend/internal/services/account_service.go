package services

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"qa-mail-manager/internal/mailer"
	"qa-mail-manager/internal/models"
	"qa-mail-manager/internal/providers"
)

const randomCharset = "abcdefghijklmnopqrstuvwxyz0123456789"

// AccountService contains the business logic for managing generated mailboxes.
type AccountService struct {
	db        *gorm.DB
	providers map[string]providers.MailProvider
	events    *EventHub
	mailer    *mailer.Mailer
	// baseline holds the environment settings; overrides from the Settings page are
	// layered on top of it into settings.
	baseline Settings

	mu            sync.RWMutex
	settings      Settings
	usernames     *usernameGenerator
	legacyPattern *regexp.Regexp
}

// NewAccountService builds an AccountService. settings.DefaultProvider is used for new
// accounts when the request names none, and must be one of the given providers.
// Call LoadSettingOverrides afterwards to apply values saved from the Settings page.
func NewAccountService(db *gorm.DB, settings Settings, mailProviders ...providers.MailProvider) (*AccountService, error) {
	s := &AccountService{
		db:        db,
		providers: map[string]providers.MailProvider{},
		events:    NewEventHub(),
		baseline:  settings,
	}
	for _, p := range mailProviders {
		s.providers[p.Name()] = p
	}
	if err := s.validateSettings(settings); err != nil {
		return nil, err
	}
	s.setEffective(settings)
	return s, nil
}

// Events is the hub the SSE endpoint subscribes to.
func (s *AccountService) Events() *EventHub {
	return s.events
}

// providerFor returns the provider that owns the account's mailbox.
func (s *AccountService) providerFor(account *models.MailAccount) (providers.MailProvider, error) {
	name := accountProvider(account)
	p, ok := s.providers[name]
	if !ok {
		return nil, fmt.Errorf("account %s uses unavailable mail provider %q", account.ID, name)
	}
	return p, nil
}

// accountProvider names the account's provider; rows created before providers existed
// have none and are Mail.tm accounts.
func accountProvider(account *models.MailAccount) string {
	if account.Provider == "" {
		return providers.NameMailTM
	}
	return account.Provider
}

// randomString generates a cryptographically secure random alphanumeric string.
func randomString(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	for i, b := range bytes {
		bytes[i] = randomCharset[int(b)%len(randomCharset)]
	}
	return string(bytes), nil
}

// ErrAccountNotFound is returned when no stored account has the given id.
var ErrAccountNotFound = errors.New("account not found")

// ErrInvalidInput marks validation failures so handlers can answer 400 instead of 502.
var ErrInvalidInput = errors.New("invalid input")

// GenerateAccountInput holds the optional labels and provider for a new account.
// An empty Provider means the configured default.
type GenerateAccountInput struct {
	Tag      string
	Note     string
	Provider string
	// Domain picks one of the provider's domains; empty lets the provider choose.
	Domain string
}

// Validate trims the labels and enforces their length limits (counted in characters).
func (in *GenerateAccountInput) Validate(limits Limits) error {
	in.Tag = strings.TrimSpace(in.Tag)
	in.Note = strings.TrimSpace(in.Note)
	in.Provider = strings.ToLower(strings.TrimSpace(in.Provider))
	in.Domain = strings.ToLower(strings.TrimSpace(in.Domain))
	if err := validateLabel("tag", in.Tag, limits.TagMaxLength); err != nil {
		return err
	}
	return validateLabel("note", in.Note, limits.NoteMaxLength)
}

// providerOr returns the requested provider, or fallback when none was requested.
func (in *GenerateAccountInput) providerOr(fallback string) string {
	if in.Provider == "" {
		return fallback
	}
	return in.Provider
}

func validateLabel(field, value string, maxLength int) error {
	if n := utf8.RuneCountInString(value); n > maxLength {
		return invalid("label_too_long", map[string]any{"field": field, "max": maxLength, "got": n},
			"%s must be at most %d characters (got %d)", field, maxLength, n)
	}
	return nil
}

// UpdateAccountInput changes an account's labels; nil fields are left untouched
// and an empty string clears the value.
type UpdateAccountInput struct {
	Tag  *string
	Note *string
}

// UpdateAccount edits an account's tag and/or note and returns the updated account.
func (s *AccountService) UpdateAccount(ctx context.Context, id uuid.UUID, input UpdateAccountInput) (*models.MailAccount, error) {
	updates := map[string]any{}
	if input.Tag != nil {
		tag := strings.TrimSpace(*input.Tag)
		if err := validateLabel("tag", tag, s.current().Limits.TagMaxLength); err != nil {
			return nil, err
		}
		updates["tag"] = tag
	}
	if input.Note != nil {
		note := strings.TrimSpace(*input.Note)
		if err := validateLabel("note", note, s.current().Limits.NoteMaxLength); err != nil {
			return nil, err
		}
		updates["note"] = note
	}
	if len(updates) == 0 {
		return nil, invalid("tag_or_note_required", nil, "provide tag and/or note")
	}

	result := s.db.WithContext(ctx).Model(&models.MailAccount{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to update account: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ErrAccountNotFound
	}
	s.events.Publish(Event{Type: EventAccountsChanged, AccountID: id.String()})
	return s.GetAccount(ctx, id)
}

// GenerateAccount creates a mailbox on the chosen provider and persists it locally.
// Input is validated first so a bad request never creates a remote mailbox.
func (s *AccountService) GenerateAccount(ctx context.Context, input GenerateAccountInput) (*models.MailAccount, error) {
	settings := s.current()
	if err := input.Validate(settings.Limits); err != nil {
		return nil, err
	}
	providerName := input.providerOr(settings.DefaultProvider)
	provider, ok := s.providers[providerName]
	if !ok {
		return nil, invalid("unknown_provider", map[string]any{"provider": providerName}, "unknown provider %q", providerName)
	}

	domain := input.Domain
	if domain != "" {
		domains, err := provider.Domains(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to list %s domains: %w", providerName, err)
		}
		if !slices.Contains(domains, domain) {
			return nil, invalid("unknown_domain", map[string]any{"domain": domain, "provider": providerName},
				"%q is not a %s domain", domain, providerName)
		}
	} else {
		var err error
		if domain, err = provider.PickDomain(ctx); err != nil {
			return nil, fmt.Errorf("failed to pick %s domain: %w", providerName, err)
		}
	}

	password, err := randomString(16)
	if err != nil {
		return nil, fmt.Errorf("failed to generate password: %w", err)
	}

	s.mu.RLock()
	usernames := s.usernames
	s.mu.RUnlock()
	email, accountID, err := registerUniqueAddress(domain, settings.UsernameMaxAttempts, usernames.generate, func(email string) (string, error) {
		var count int64
		if err := s.db.WithContext(ctx).Model(&models.MailAccount{}).Where("email = ?", email).Count(&count).Error; err != nil {
			return "", fmt.Errorf("failed to check address: %w", err)
		}
		if count > 0 {
			return "", providers.ErrAddressTaken
		}
		id, err := provider.CreateAddress(ctx, email, password)
		if err != nil && !errors.Is(err, providers.ErrAddressTaken) {
			return "", fmt.Errorf("failed to register account on %s: %w", providerName, err)
		}
		return id, err
	})
	if err != nil {
		return nil, err
	}

	account := &models.MailAccount{
		Provider:  providerName,
		AccountID: accountID,
		Email:     email,
		Password:  password,
		Domain:    domain,
		Status:    models.StatusAvailable,
		Tag:       input.Tag,
		Note:      input.Note,
	}
	if err := s.db.WithContext(ctx).Create(account).Error; err != nil {
		return nil, fmt.Errorf("failed to save account: %w", err)
	}
	s.markLegacy(account)
	s.events.Publish(Event{Type: EventAccountsChanged, AccountID: account.ID.String()})

	return account, nil
}

// Account list sort orders.
const (
	SortNewest        = "newest"
	SortLatestMessage = "latest_message"
)

const (
	defaultPageLimit = 20
	maxPageLimit     = 100
)

// ListAccountsParams filters, sorts and paginates GET /api/accounts.
type ListAccountsParams struct {
	Search   string
	Status   string
	Provider string
	// Legacy limits the list to accounts whose address matches the legacy pattern.
	Legacy bool
	Sort   string
	Page   int
	Limit  int
}

// Normalize clamps paging values and falls back to defaults for unknown options.
func (p *ListAccountsParams) Normalize() {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.Limit < 1 {
		p.Limit = defaultPageLimit
	}
	if p.Limit > maxPageLimit {
		p.Limit = maxPageLimit
	}
	if p.Sort != SortLatestMessage {
		p.Sort = SortNewest
	}
	p.Search = strings.TrimSpace(p.Search)
	p.Provider = strings.ToLower(strings.TrimSpace(p.Provider))
}

// PageMeta describes a paginated result so clients can load more on demand.
type PageMeta struct {
	Page    int   `json:"page"`
	Limit   int   `json:"limit"`
	Total   int64 `json:"total"`
	HasMore bool  `json:"hasMore"`
}

// likePattern escapes LIKE wildcards so user input is matched literally.
func likePattern(term string) string {
	escaped := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(term)
	return "%" + escaped + "%"
}

// ListAccounts returns one page of stored accounts matching the given filters.
func (s *AccountService) ListAccounts(ctx context.Context, params ListAccountsParams) ([]models.MailAccount, PageMeta, error) {
	params.Normalize()

	query := s.db.WithContext(ctx).Model(&models.MailAccount{})
	if params.Search != "" {
		pattern := likePattern(params.Search)
		query = query.Where("email ILIKE ? OR domain ILIKE ? OR tag ILIKE ? OR note ILIKE ?", pattern, pattern, pattern, pattern)
	}
	if params.Status != "" {
		query = query.Where("status = ?", params.Status)
	}
	if params.Provider != "" {
		query = query.Where("provider = ?", params.Provider)
	}
	if params.Legacy {
		pattern := s.current().LegacyUsernamePattern
		if pattern == "" {
			return []models.MailAccount{}, PageMeta{Page: params.Page, Limit: params.Limit}, nil
		}
		query = query.Where(legacySQL, pattern)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, PageMeta{}, fmt.Errorf("failed to count accounts: %w", err)
	}

	order := "created_at DESC"
	if params.Sort == SortLatestMessage {
		order = "last_message_at DESC NULLS LAST, created_at DESC"
	}

	var accounts []models.MailAccount
	err := query.Order(order + ", id").
		Offset((params.Page - 1) * params.Limit).
		Limit(params.Limit).
		Find(&accounts).Error
	if err != nil {
		return nil, PageMeta{}, fmt.Errorf("failed to list accounts: %w", err)
	}
	for i := range accounts {
		s.markLegacy(&accounts[i])
	}

	meta := PageMeta{
		Page:    params.Page,
		Limit:   params.Limit,
		Total:   total,
		HasMore: int64(params.Page*params.Limit) < total,
	}
	return accounts, meta, nil
}

// GetAccount returns a single stored account.
func (s *AccountService) GetAccount(ctx context.Context, id uuid.UUID) (*models.MailAccount, error) {
	account, err := s.getAccount(ctx, id)
	if err != nil {
		return nil, err
	}
	s.markLegacy(account)
	return account, nil
}

// legacySQL matches the local part against the legacy pattern with PostgreSQL's regex
// operator. Simple patterns (anchors, literals, classes) behave the same as in Go.
const legacySQL = "split_part(email, '@', 1) ~ ?"

// markLegacy flags an account whose local part matches LegacyUsernamePattern.
// An empty pattern disables the check.
func (s *AccountService) markLegacy(account *models.MailAccount) {
	s.mu.RLock()
	pattern, re := s.settings.LegacyUsernamePattern, s.legacyPattern
	s.mu.RUnlock()
	localPart, _, _ := strings.Cut(account.Email, "@")
	account.LegacyName = pattern != "" && re.MatchString(localPart)
}

// ReplaceResult is the account created by ReplaceAccount and the one it replaces.
type ReplaceResult struct {
	Account    *models.MailAccount `json:"account"`
	ReplacedID uuid.UUID           `json:"replacedId"`
}

// ReplaceAccount generates a fresh, human-looking address on the same provider with the
// same tag and note, and marks the old account BLOCKED so it is not reused. The old
// account and its inbox stay readable.
func (s *AccountService) ReplaceAccount(ctx context.Context, id uuid.UUID) (*ReplaceResult, error) {
	old, err := s.getAccount(ctx, id)
	if err != nil {
		return nil, err
	}
	account, err := s.GenerateAccount(ctx, GenerateAccountInput{Tag: old.Tag, Note: old.Note, Provider: accountProvider(old)})
	if err != nil {
		return nil, err
	}
	if err := s.UpdateStatus(ctx, old.ID, models.StatusBlocked); err != nil {
		return nil, fmt.Errorf("new account %s created, but failed to block the old one: %w", account.Email, err)
	}
	return &ReplaceResult{Account: account, ReplacedID: old.ID}, nil
}

// DomainCount is the number of accounts on one domain.
type DomainCount struct {
	Domain string `json:"domain"`
	Count  int64  `json:"count"`
}

// ProviderCount is the number of accounts and stored messages on one provider.
type ProviderCount struct {
	Provider string `json:"provider"`
	Count    int64  `json:"count"`
	// Messages sums the inbox sizes recorded by the last sync or ingest.
	Messages int64 `json:"messages"`
}

// AccountStats summarises all accounts for dashboards and filter badges.
type AccountStats struct {
	Total      int64            `json:"total"`
	ByStatus   map[string]int64 `json:"byStatus"`
	ByDomain   []DomainCount    `json:"byDomain"`
	ByProvider []ProviderCount  `json:"byProvider"`
	// Legacy counts accounts whose address matches the legacy naming pattern.
	Legacy int64 `json:"legacy"`
}

// Stats aggregates account counts per status and per domain.
func (s *AccountService) Stats(ctx context.Context) (*AccountStats, error) {
	stats := &AccountStats{
		ByStatus: map[string]int64{
			models.StatusAvailable: 0,
			models.StatusUsed:      0,
			models.StatusBlocked:   0,
		},
		ByDomain:   []DomainCount{},
		ByProvider: []ProviderCount{},
	}

	var byStatus []struct {
		Status string
		Count  int64
	}
	if err := s.db.WithContext(ctx).Model(&models.MailAccount{}).
		Select("status, COUNT(*) AS count").Group("status").Scan(&byStatus).Error; err != nil {
		return nil, fmt.Errorf("failed to aggregate statuses: %w", err)
	}
	for _, row := range byStatus {
		stats.ByStatus[row.Status] = row.Count
		stats.Total += row.Count
	}

	if err := s.db.WithContext(ctx).Model(&models.MailAccount{}).
		Select("domain, COUNT(*) AS count").Group("domain").Order("count DESC, domain").
		Scan(&stats.ByDomain).Error; err != nil {
		return nil, fmt.Errorf("failed to aggregate domains: %w", err)
	}

	if err := s.db.WithContext(ctx).Model(&models.MailAccount{}).
		Select("provider, COUNT(*) AS count, COALESCE(SUM(message_count), 0) AS messages").
		Group("provider").Order("count DESC, provider").
		Scan(&stats.ByProvider).Error; err != nil {
		return nil, fmt.Errorf("failed to aggregate providers: %w", err)
	}

	if pattern := s.current().LegacyUsernamePattern; pattern != "" {
		if err := s.db.WithContext(ctx).Model(&models.MailAccount{}).
			Where(legacySQL, pattern).Count(&stats.Legacy).Error; err != nil {
			return nil, fmt.Errorf("failed to count legacy accounts: %w", err)
		}
	}

	return stats, nil
}

// UpdateStatus changes an account's status, validating it against the allowed values.
func (s *AccountService) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	switch status {
	case models.StatusAvailable, models.StatusUsed, models.StatusBlocked:
	default:
		return invalid("invalid_status", map[string]any{"status": status}, "status %q must be one of AVAILABLE, USED, BLOCKED", status)
	}

	result := s.db.WithContext(ctx).Model(&models.MailAccount{}).Where("id = ?", id).Update("status", status)
	if result.Error != nil {
		return fmt.Errorf("failed to update status: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccountNotFound
	}
	s.events.Publish(Event{Type: EventAccountsChanged, AccountID: id.String()})
	return nil
}

// DeleteAccount removes an account (and any locally stored messages) from PostgreSQL only;
// the Mail.tm side is left untouched.
func (s *AccountService) DeleteAccount(ctx context.Context, id uuid.UUID) error {
	result := s.db.WithContext(ctx).Delete(&models.MailAccount{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete account: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccountNotFound
	}
	s.events.Publish(Event{Type: EventAccountsChanged, AccountID: id.String()})
	return nil
}

// getAccount loads an account by id, used internally by the inbox operations.
func (s *AccountService) getAccount(ctx context.Context, id uuid.UUID) (*models.MailAccount, error) {
	var account models.MailAccount
	if err := s.db.WithContext(ctx).First(&account, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAccountNotFound
		}
		return nil, fmt.Errorf("failed to load account: %w", err)
	}
	return &account, nil
}
