package services

import (
	"errors"
	"strings"
	"testing"
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
		{name: "tag at limit", input: GenerateAccountInput{Tag: strings.Repeat("a", MaxTagLength)}, want: GenerateAccountInput{Tag: strings.Repeat("a", MaxTagLength)}},
		{name: "tag over limit", input: GenerateAccountInput{Tag: strings.Repeat("a", MaxTagLength+1)}, wantErr: true},
		{name: "note over limit", input: GenerateAccountInput{Note: strings.Repeat("n", MaxNoteLength+1)}, wantErr: true},
		{
			// 50 emoji are 200 bytes but 50 characters
			name:  "limit counts characters, not bytes",
			input: GenerateAccountInput{Tag: strings.Repeat("😀", MaxTagLength)},
			want:  GenerateAccountInput{Tag: strings.Repeat("😀", MaxTagLength)},
		},
		{name: "whitespace does not count toward the limit", input: GenerateAccountInput{Tag: "  " + strings.Repeat("a", MaxTagLength) + "  "}, want: GenerateAccountInput{Tag: strings.Repeat("a", MaxTagLength)}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := tt.input
			err := input.Validate()
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
