package services

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"qa-mail-manager/internal/mailtm"
	"qa-mail-manager/internal/models"
)

const randomCharset = "abcdefghijklmnopqrstuvwxyz0123456789"

// AccountService contains the business logic for managing Mail.tm accounts.
type AccountService struct {
	db     *gorm.DB
	mailtm *mailtm.Service
}

// NewAccountService builds an AccountService with its dependencies injected.
func NewAccountService(db *gorm.DB, mailtmSvc *mailtm.Service) *AccountService {
	return &AccountService{db: db, mailtm: mailtmSvc}
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

// Limits for the free-text labels users attach to generated accounts.
const (
	MaxTagLength  = 50
	MaxNoteLength = 500
)

// ErrAccountNotFound is returned when no stored account has the given id.
var ErrAccountNotFound = errors.New("account not found")

// ErrInvalidInput marks validation failures so handlers can answer 400 instead of 502.
var ErrInvalidInput = errors.New("invalid input")

// GenerateAccountInput holds the optional labels for a new account.
type GenerateAccountInput struct {
	Tag  string
	Note string
}

// Validate trims the labels and enforces their length limits (counted in characters).
func (in *GenerateAccountInput) Validate() error {
	in.Tag = strings.TrimSpace(in.Tag)
	in.Note = strings.TrimSpace(in.Note)
	if err := validateLabel("tag", in.Tag, MaxTagLength); err != nil {
		return err
	}
	return validateLabel("note", in.Note, MaxNoteLength)
}

func validateLabel(field, value string, maxLength int) error {
	if n := utf8.RuneCountInString(value); n > maxLength {
		return fmt.Errorf("%w: %s must be at most %d characters (got %d)", ErrInvalidInput, field, maxLength, n)
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
		if err := validateLabel("tag", tag, MaxTagLength); err != nil {
			return nil, err
		}
		updates["tag"] = tag
	}
	if input.Note != nil {
		note := strings.TrimSpace(*input.Note)
		if err := validateLabel("note", note, MaxNoteLength); err != nil {
			return nil, err
		}
		updates["note"] = note
	}
	if len(updates) == 0 {
		return nil, fmt.Errorf("%w: provide tag and/or note", ErrInvalidInput)
	}

	result := s.db.WithContext(ctx).Model(&models.MailAccount{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to update account: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ErrAccountNotFound
	}
	return s.getAccount(ctx, id)
}

// GenerateAccount creates a new Mail.tm account and persists it locally.
// Input is validated first so a bad request never creates an account on Mail.tm.
func (s *AccountService) GenerateAccount(ctx context.Context, input GenerateAccountInput) (*models.MailAccount, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	domain, err := s.mailtm.PickAvailableDomain(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to pick mail.tm domain: %w", err)
	}

	usernameSuffix, err := randomString(8)
	if err != nil {
		return nil, fmt.Errorf("failed to generate username: %w", err)
	}
	password, err := randomString(16)
	if err != nil {
		return nil, fmt.Errorf("failed to generate password: %w", err)
	}

	username := "qa_test_" + usernameSuffix
	email := username + "@" + domain

	accountID, err := s.mailtm.RegisterAccount(ctx, email, password)
	if err != nil {
		return nil, fmt.Errorf("failed to register account on mail.tm: %w", err)
	}

	account := &models.MailAccount{
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
	Search string
	Status string
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
	return s.getAccount(ctx, id)
}

// DomainCount is the number of accounts on one Mail.tm domain.
type DomainCount struct {
	Domain string `json:"domain"`
	Count  int64  `json:"count"`
}

// AccountStats summarises all accounts for dashboards and filter badges.
type AccountStats struct {
	Total    int64            `json:"total"`
	ByStatus map[string]int64 `json:"byStatus"`
	ByDomain []DomainCount    `json:"byDomain"`
}

// Stats aggregates account counts per status and per domain.
func (s *AccountService) Stats(ctx context.Context) (*AccountStats, error) {
	stats := &AccountStats{
		ByStatus: map[string]int64{
			models.StatusAvailable: 0,
			models.StatusUsed:      0,
			models.StatusBlocked:   0,
		},
		ByDomain: []DomainCount{},
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

	return stats, nil
}

// UpdateStatus changes an account's status, validating it against the allowed values.
func (s *AccountService) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	switch status {
	case models.StatusAvailable, models.StatusUsed, models.StatusBlocked:
	default:
		return fmt.Errorf("%w: status %q must be one of AVAILABLE, USED, BLOCKED", ErrInvalidInput, status)
	}

	result := s.db.WithContext(ctx).Model(&models.MailAccount{}).Where("id = ?", id).Update("status", status)
	if result.Error != nil {
		return fmt.Errorf("failed to update status: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccountNotFound
	}
	return nil
}

// DeleteAccount removes an account from PostgreSQL only (Mail.tm side is left untouched).
func (s *AccountService) DeleteAccount(ctx context.Context, id uuid.UUID) error {
	result := s.db.WithContext(ctx).Delete(&models.MailAccount{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete account: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccountNotFound
	}
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
