package services

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"qa-mail-manager/internal/models"
	"qa-mail-manager/internal/providers"
)

func TestGenerateAccountInputValidate(t *testing.T) {
	tests := []struct {
		name    string
		input   GenerateAccountInput
		wantErr bool
		want    GenerateAccountInput
	}{
		{name: "empty is allowed", input: GenerateAccountInput{}},
		{
			name:  "trims surrounding whitespace",
			input: GenerateAccountInput{Tag: "  login-flow ", Note: "\n note \t"},
			want:  GenerateAccountInput{Tag: "login-flow", Note: "note"},
		},
		{name: "tag at limit", input: GenerateAccountInput{Tag: strings.Repeat("a", testLimits.TagMaxLength)}, want: GenerateAccountInput{Tag: strings.Repeat("a", testLimits.TagMaxLength)}},
		{name: "tag over limit", input: GenerateAccountInput{Tag: strings.Repeat("a", testLimits.TagMaxLength+1)}, wantErr: true},
		{name: "note over limit", input: GenerateAccountInput{Note: strings.Repeat("n", testLimits.NoteMaxLength+1)}, wantErr: true},
		{
			// 50 emoji are 200 bytes but 50 characters
			name:  "limit counts characters, not bytes",
			input: GenerateAccountInput{Tag: strings.Repeat("😀", testLimits.TagMaxLength)},
			want:  GenerateAccountInput{Tag: strings.Repeat("😀", testLimits.TagMaxLength)},
		},
		{name: "whitespace does not count toward the limit", input: GenerateAccountInput{Tag: "  " + strings.Repeat("a", testLimits.TagMaxLength) + "  "}, want: GenerateAccountInput{Tag: strings.Repeat("a", testLimits.TagMaxLength)}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := tt.input
			err := input.Validate(testLimits)
			if tt.wantErr {
				if !errors.Is(err, ErrInvalidInput) {
					t.Fatalf("expected ErrInvalidInput, got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if input != tt.want {
				t.Fatalf("got %+v, want %+v", input, tt.want)
			}
		})
	}
}

func TestListAccountsParamsNormalize(t *testing.T) {
	tests := []struct {
		name string
		in   ListAccountsParams
		want ListAccountsParams
	}{
		{name: "defaults", in: ListAccountsParams{}, want: ListAccountsParams{Page: 1, Limit: defaultPageLimit, Sort: SortNewest}},
		{name: "negative page", in: ListAccountsParams{Page: -3, Limit: 10}, want: ListAccountsParams{Page: 1, Limit: 10, Sort: SortNewest}},
		{name: "limit capped", in: ListAccountsParams{Page: 2, Limit: 1000}, want: ListAccountsParams{Page: 2, Limit: maxPageLimit, Sort: SortNewest}},
		{name: "unknown sort falls back", in: ListAccountsParams{Sort: "oldest"}, want: ListAccountsParams{Page: 1, Limit: defaultPageLimit, Sort: SortNewest}},
		{name: "latest message kept", in: ListAccountsParams{Sort: SortLatestMessage}, want: ListAccountsParams{Page: 1, Limit: defaultPageLimit, Sort: SortLatestMessage}},
		{name: "search trimmed", in: ListAccountsParams{Search: "  qa_test "}, want: ListAccountsParams{Search: "qa_test", Page: 1, Limit: defaultPageLimit, Sort: SortNewest}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.in
			got.Normalize()
			if got != tt.want {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestLikePatternEscapesWildcards(t *testing.T) {
	tests := map[string]string{
		"qa_test": `%qa\_test%`,
		"100%":    `%100\%%`,
		`a\b`:     `%a\\b%`,
		"plain":   "%plain%",
	}
	for in, want := range tests {
		if got := likePattern(in); got != want {
			t.Errorf("likePattern(%q) = %q, want %q", in, got, want)
		}
	}
}

var testLimits = Limits{TagMaxLength: 50, NoteMaxLength: 500}

func testSettings(defaultProvider string) Settings {
	return Settings{
		DefaultProvider:       defaultProvider,
		Limits:                testLimits,
		UsernameMaxAttempts:   5,
		InboxSearchMaxPages:   10,
		MessagePruneInterval:  time.Hour,
		LegacyUsernamePattern: "^qa_test_",
	}
}

func TestNewAccountServiceRejectsInvalidSettings(t *testing.T) {
	bad := testSettings("mailtm")
	bad.UsernameMaxAttempts = 0
	if _, err := NewAccountService(nil, bad, stubProvider{"mailtm"}); err == nil {
		t.Fatal("expected error for zero username attempts")
	}
}

func TestGenerateAccountUsesConfiguredLimits(t *testing.T) {
	settings := testSettings("mailtm")
	settings.Limits.TagMaxLength = 3
	s, _ := NewAccountService(nil, settings, stubProvider{"mailtm"})
	_, err := s.GenerateAccount(context.Background(), GenerateAccountInput{Tag: "abcd"})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for a tag over the configured limit, got %v", err)
	}
}

type stubProvider struct{ name string }

func (p stubProvider) Label() string                            { return p.name }
func (p stubProvider) Name() string                             { return p.name }
func (stubProvider) PickDomain(context.Context) (string, error) { return "example.com", nil }
func (stubProvider) CreateAddress(context.Context, string, string) (string, error) {
	return "id", nil
}
func (stubProvider) ListMessages(context.Context, *models.MailAccount, int) (*providers.MessagePage, error) {
	return &providers.MessagePage{}, nil
}
func (stubProvider) GetMessage(context.Context, *models.MailAccount, string) (*providers.MessageDetail, error) {
	return nil, nil
}
func (stubProvider) MarkSeen(context.Context, *models.MailAccount, string) error { return nil }
func (stubProvider) Delete(context.Context, *models.MailAccount, string) error   { return nil }
func (stubProvider) GetAttachment(context.Context, *models.MailAccount, string, string) (*providers.File, error) {
	return nil, providers.ErrMessageNotFound
}
func (stubProvider) GetSource(context.Context, *models.MailAccount, string) (*providers.File, error) {
	return nil, providers.ErrMessageNotFound
}

func TestNewAccountServiceRejectsUnknownDefault(t *testing.T) {
	if _, err := NewAccountService(nil, testSettings("gmail"), stubProvider{"mailtm"}); err == nil {
		t.Fatal("expected error for unknown default provider")
	}
	s, err := NewAccountService(nil, testSettings("local"), stubProvider{"mailtm"}, stubProvider{"local"})
	if err != nil {
		t.Fatal(err)
	}
	info, err := s.AppSettings(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, p := range info.Providers {
		if !p.Available || p.Domain != "example.com" {
			t.Fatalf("expected available provider with domain, got %+v", p)
		}
		names = append(names, p.Name)
	}
	if info.DefaultProvider != "local" || strings.Join(names, ",") != "local,mailtm" {
		t.Fatalf("unexpected settings %+v", info)
	}
	if info.Limits != testLimits || info.Inbox.MessageRetention != "disabled" {
		t.Fatalf("unexpected limits/inbox %+v %+v", info.Limits, info.Inbox)
	}
}

func TestProviderForDefaultsLegacyRowsToMailTM(t *testing.T) {
	s, _ := NewAccountService(nil, testSettings("mailtm"), stubProvider{"mailtm"})
	p, err := s.providerFor(&models.MailAccount{})
	if err != nil || p.Name() != "mailtm" {
		t.Fatalf("got %v, %v", p, err)
	}
	if _, err := s.providerFor(&models.MailAccount{Provider: "local"}); err == nil {
		t.Fatal("expected error for an account whose provider is not configured")
	}
}

func TestGenerateAccountRejectsUnknownProvider(t *testing.T) {
	s, _ := NewAccountService(nil, testSettings("mailtm"), stubProvider{"mailtm"})
	_, err := s.GenerateAccount(context.Background(), GenerateAccountInput{Provider: "yahoo"})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}
