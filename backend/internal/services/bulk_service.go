package services

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"qa-mail-manager/internal/models"
	"qa-mail-manager/internal/providers"
)

// BulkGenerateResult lists what a bulk generate created and, if it stopped early, why.
type BulkGenerateResult struct {
	Accounts  []*models.MailAccount `json:"accounts"`
	Requested int                   `json:"requested"`
	// Error is set when generation stopped before Requested accounts were created;
	// the accounts created so far are kept.
	Error string `json:"error,omitempty"`
}

// GenerateAccounts creates count accounts with the same labels, provider and domain.
// Count is limited by the BulkGenerateMax setting. Mail.tm accounts are spaced by
// MailTMRequestDelay to respect its rate limit.
func (s *AccountService) GenerateAccounts(ctx context.Context, input GenerateAccountInput, count int) (*BulkGenerateResult, error) {
	settings := s.current()
	if count < 1 || count > settings.BulkGenerateMax {
		return nil, fmt.Errorf("%w: count must be between 1 and %d", ErrInvalidInput, settings.BulkGenerateMax)
	}
	if err := input.Validate(settings.Limits); err != nil {
		return nil, err
	}

	// Local addresses need no remote call, so only Mail.tm is throttled
	throttle := input.providerOr(settings.DefaultProvider) != providers.NameLocal
	result := &BulkGenerateResult{Accounts: []*models.MailAccount{}, Requested: count}
	for i := 0; i < count; i++ {
		if i > 0 && throttle {
			select {
			case <-ctx.Done():
				result.Error = ctx.Err().Error()
				return result, nil
			case <-time.After(settings.MailTMRequestDelay):
			}
		}
		account, err := s.GenerateAccount(ctx, input)
		if err != nil {
			if len(result.Accounts) == 0 {
				return nil, err
			}
			result.Error = err.Error()
			return result, nil
		}
		result.Accounts = append(result.Accounts, account)
	}
	return result, nil
}

// exportColumns are the CSV header; passwords are never exported.
var exportColumns = []string{"email", "provider", "domain", "status", "tag", "note",
	"message_count", "last_message_at", "created_at", "id"}

// ExportAccountsCSV writes every account matching the list filters as CSV.
func (s *AccountService) ExportAccountsCSV(ctx context.Context, params ListAccountsParams, w io.Writer) error {
	out := csv.NewWriter(w)
	if err := out.Write(exportColumns); err != nil {
		return err
	}
	params.Limit = maxPageLimit
	for page := 1; ; page++ {
		params.Page = page
		accounts, meta, err := s.ListAccounts(ctx, params)
		if err != nil {
			return err
		}
		for _, a := range accounts {
			lastMessage := ""
			if a.LastMessageAt != nil {
				lastMessage = a.LastMessageAt.UTC().Format(time.RFC3339)
			}
			row := []string{a.Email, a.Provider, a.Domain, a.Status, a.Tag, a.Note,
				strconv.Itoa(a.MessageCount), lastMessage, a.CreatedAt.UTC().Format(time.RFC3339), a.ID.String()}
			for i := range row {
				row[i] = csvSafe(row[i])
			}
			if err := out.Write(row); err != nil {
				return err
			}
		}
		if !meta.HasMore {
			break
		}
	}
	out.Flush()
	return out.Error()
}

// csvSafe stops spreadsheet apps from evaluating user text (tags, notes) as formulas.
func csvSafe(value string) string {
	if value != "" && strings.ContainsRune("=+-@\t\r", rune(value[0])) {
		return "'" + value
	}
	return value
}
