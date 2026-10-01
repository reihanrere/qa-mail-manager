package services

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"qa-mail-manager/internal/models"
)

func TestApplyOverrides(t *testing.T) {
	base := testSettings("mailtm")
	got, err := applyOverrides(base, map[string]string{
		"tagMaxLength":       `20`,
		"messageRetention":   `"48h"`,
		"usernameFirstNames": `[" Budi ", "", "SARI"]`,
		"defaultProvider":    `" LOCAL "`,
		"removedSetting":     `true`, // ignored
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Limits.TagMaxLength != 20 || got.MessageRetention != 48*time.Hour || got.DefaultProvider != "local" {
		t.Fatalf("unexpected %+v", got)
	}
	if len(got.FirstNames) != 2 || got.FirstNames[0] != "budi" || got.FirstNames[1] != "sari" {
		t.Fatalf("list not cleaned: %q", got.FirstNames)
	}
	if base.Limits.TagMaxLength != 50 {
		t.Fatal("baseline must not be modified")
	}
}

func TestApplyOverridesRejectsBadValues(t *testing.T) {
	for key, value := range map[string]string{
		"tagMaxLength":     `"fifty"`,
		"messageRetention": `"soon"`,
	} {
		if _, err := applyOverrides(testSettings("mailtm"), map[string]string{key: value}); !errors.Is(err, ErrInvalidInput) {
			t.Errorf("%s=%s: expected ErrInvalidInput, got %v", key, value, err)
		}
	}
}

func TestEditableValuesRoundTrip(t *testing.T) {
	settings := testSettings("mailtm")
	settings.InboxSyncInterval = 90 * time.Second
	values := editableValues(settings)

	overrides := map[string]string{}
	for key, value := range values {
		raw, _ := json.Marshal(value)
		overrides[key] = string(raw)
	}
	got, err := applyOverrides(Settings{MessagePruneInterval: time.Hour}, overrides)
	if err != nil {
		t.Fatal(err)
	}
	if got.InboxSyncInterval != 90*time.Second || got.Limits != settings.Limits || got.LegacyUsernamePattern != "^qa_test_" {
		t.Fatalf("round trip lost values: %+v", got)
	}
}

func TestUpdateSettingsRejectsUnknownKeyBeforeTouchingDB(t *testing.T) {
	s, _ := NewAccountService(nil, testSettings("mailtm"), stubProvider{"mailtm"})
	err := s.UpdateSettings(t.Context(), SettingsPatch{Values: map[string]json.RawMessage{"ingestSecret": []byte(`"x"`)}})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
	if err := s.UpdateSettings(t.Context(), SettingsPatch{}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for an empty patch, got %v", err)
	}
}

func TestMarkLegacy(t *testing.T) {
	s, _ := NewAccountService(nil, testSettings("mailtm"), stubProvider{"mailtm"})
	for email, want := range map[string]bool{
		"qa_test_ab12cd34@uberip.com": true,
		"rinda.saputra91@uberip.com":  false,
		"someone@qa_test_.example":    false, // only the local part counts
	} {
		account := &models.MailAccount{Email: email}
		s.markLegacy(account)
		if account.LegacyName != want {
			t.Errorf("%s: got %v, want %v", email, account.LegacyName, want)
		}
	}

	disabled := testSettings("mailtm")
	disabled.LegacyUsernamePattern = ""
	s, _ = NewAccountService(nil, disabled, stubProvider{"mailtm"})
	account := &models.MailAccount{Email: "qa_test_x@uberip.com"}
	s.markLegacy(account)
	if account.LegacyName {
		t.Fatal("an empty pattern must disable the legacy check")
	}
}
