package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"qa-mail-manager/internal/database"
	"qa-mail-manager/internal/models"
	"qa-mail-manager/internal/providers"
)

// These tests need a disposable PostgreSQL database, e.g.
//
//	docker run -d --rm --name qamm-test-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:17-alpine
//	TEST_DATABASE_DSN="host=localhost port=55432 user=postgres password=pw dbname=postgres sslmode=disable" go test ./...
//
// They are skipped when TEST_DATABASE_DSN is not set. Every table is emptied first.
func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_DSN")
	if dsn == "" {
		t.Skip("TEST_DATABASE_DSN not set")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("TRUNCATE messages, mail_accounts, setting_overrides CASCADE").Error; err != nil {
		t.Fatal(err)
	}
	return db
}

// remoteStub stands in for Mail.tm with unique remote ids.
type remoteStub struct{ stubProvider }

func (remoteStub) CreateAddress(context.Context, string, string) (string, error) {
	return uuid.NewString(), nil
}

func newIntegrationService(t *testing.T, db *gorm.DB) *AccountService {
	t.Helper()
	settings := testSettings(providers.NameLocal)
	settings.IngestEnabled = true
	s, err := NewAccountService(db, settings, remoteStub{stubProvider{providers.NameMailTM}}, providers.NewLocal(db, "re-testing.me"))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

const integrationEmail = `From: "Shop Bot" <shop@example.com>
To: {{TO}}
Subject: Invoice 10.10 with code 482913
Message-ID: <invoice-1@example.com>
Content-Type: multipart/mixed; boundary="mix"

--mix
Content-Type: text/plain; charset=utf-8

Your verification code is 482913. 100% off_sale
--mix
Content-Type: application/pdf; name="invoice.pdf"
Content-Disposition: attachment; filename="invoice.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK
--mix--
`

func TestIntegrationLocalInboxLifecycle(t *testing.T) {
	db := testDB(t)
	s := newIntegrationService(t, db)
	ctx := context.Background()

	events, unsubscribe := s.Events().Subscribe()
	defer unsubscribe()

	account, err := s.GenerateAccount(ctx, GenerateAccountInput{Tag: "it"})
	if err != nil {
		t.Fatal(err)
	}
	if account.Provider != providers.NameLocal || !strings.HasSuffix(account.Email, "@re-testing.me") {
		t.Fatalf("unexpected account %+v", account)
	}
	if e := <-events; e.Type != EventAccountsChanged {
		t.Fatalf("expected accounts.changed, got %+v", e)
	}

	raw := crlfBytes(strings.ReplaceAll(integrationEmail, "{{TO}}", account.Email))
	result, err := s.IngestMessage(ctx, raw, account.Email)
	if err != nil || result.Duplicate {
		t.Fatalf("ingest: %+v %v", result, err)
	}
	if e := <-events; e.Type != EventMessageCreated || e.AccountEmail != account.Email || !strings.Contains(e.Subject, "Invoice") {
		t.Fatalf("expected message.created, got %+v", e)
	}
	if again, _ := s.IngestMessage(ctx, raw, account.Email); !again.Duplicate {
		t.Fatal("same Message-ID must be reported as duplicate")
	}
	// Concurrent retries must store exactly one copy (enforced by the unique index)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			concurrent := bytes.Replace(raw, []byte("invoice-1@"), []byte("invoice-2@"), 1)
			if _, err := s.IngestMessage(ctx, concurrent, account.Email); err != nil {
				t.Errorf("concurrent ingest: %v", err)
			}
		}()
	}
	wg.Wait()
	var copies int64
	db.Model(&models.Message{}).Where("message_id = ?", "invoice-2@example.com").Count(&copies)
	if copies != 1 {
		t.Fatalf("expected exactly one stored copy, got %d", copies)
	}
	for len(events) > 0 { // drain events from the extra ingests
		<-events
	}
	db.Where("message_id = ?", "invoice-2@example.com").Delete(&models.Message{})
	if _, err := s.IngestMessage(ctx, raw, "nobody@re-testing.me"); !errors.Is(err, ErrRecipientNotFound) {
		t.Fatalf("expected ErrRecipientNotFound, got %v", err)
	}

	inbox, err := s.GetInbox(ctx, account.ID, 1, "")
	if err != nil || inbox.Meta.Total != 1 {
		t.Fatalf("inbox: %+v %v", inbox, err)
	}
	messageID := inbox.Messages[0].ID

	for term, want := range map[string]int{"invoice": 1, "SHOP@": 1, "100%": 1, "off_": 1, "%%": 0, "nothing": 0} {
		found, err := s.GetInbox(ctx, account.ID, 1, term)
		if err != nil || len(found.Messages) != want {
			t.Errorf("search %q: got %d messages (%v), want %d", term, len(found.Messages), err, want)
		}
	}

	detail, err := s.GetMessageDetail(ctx, account.ID, messageID)
	if err != nil || len(detail.Attachments) != 1 || detail.Attachments[0].Filename != "invoice.pdf" {
		t.Fatalf("detail: %+v %v", detail, err)
	}
	file, err := s.GetAttachment(ctx, account.ID, messageID, detail.Attachments[0].ID)
	if err != nil || string(file.Data) != "%PDF-1.4\n" || file.ContentType != "application/pdf" {
		t.Fatalf("attachment: %+v %v", file, err)
	}
	if _, err := s.GetAttachment(ctx, account.ID, messageID, "9"); !errors.Is(err, providers.ErrMessageNotFound) {
		t.Fatalf("expected not found for a missing attachment, got %v", err)
	}
	source, err := s.GetMessageSource(ctx, account.ID, messageID)
	if err != nil || !bytes.Equal(source.Data, raw) {
		t.Fatalf("source mismatch: %v", err)
	}

	stored, _ := s.GetAccount(ctx, account.ID)
	if stored.MessageCount != 1 || stored.LastMessageAt == nil {
		t.Fatalf("activity not recorded: %+v", stored)
	}

	if err := s.DeleteAccount(ctx, account.ID); err != nil {
		t.Fatal(err)
	}
	var left int64
	db.Model(&models.Message{}).Count(&left)
	if left != 0 {
		t.Fatalf("messages must be deleted with their account, %d left", left)
	}
}

func TestIntegrationSettingsOverrides(t *testing.T) {
	db := testDB(t)
	s := newIntegrationService(t, db)
	ctx := context.Background()

	err := s.UpdateSettings(ctx, SettingsPatch{Values: map[string]json.RawMessage{
		"tagMaxLength":    []byte(`3`),
		"defaultProvider": []byte(`"mailtm"`),
	}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.GenerateAccount(ctx, GenerateAccountInput{Tag: "abcd"}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("override not applied: %v", err)
	}
	account, err := s.GenerateAccount(ctx, GenerateAccountInput{Tag: "abc"})
	if err != nil || account.Provider != providers.NameMailTM {
		t.Fatalf("default provider override not applied: %+v %v", account, err)
	}

	// A fresh service (app restart) picks the overrides up from the database
	restarted := newIntegrationService(t, db)
	if err := restarted.LoadSettingOverrides(ctx); err != nil {
		t.Fatal(err)
	}
	info, err := restarted.AppSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if info.Limits.TagMaxLength != 3 || info.DefaultProvider != "mailtm" || len(info.Overridden) != 2 {
		t.Fatalf("overrides not reloaded: %+v", info)
	}
	if info.Defaults["tagMaxLength"] != 50 {
		t.Fatalf("defaults must stay the environment values, got %v", info.Defaults["tagMaxLength"])
	}

	if err := restarted.UpdateSettings(ctx, SettingsPatch{Reset: []string{"tagMaxLength"}}); err != nil {
		t.Fatal(err)
	}
	if restarted.current().Limits.TagMaxLength != 50 {
		t.Fatal("reset did not restore the environment default")
	}

	invalid := SettingsPatch{Values: map[string]json.RawMessage{"defaultProvider": []byte(`"gmail"`)}}
	if err := restarted.UpdateSettings(ctx, invalid); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
	if restarted.current().DefaultProvider != "mailtm" {
		t.Fatal("a rejected patch must not change the settings")
	}
}

func TestIntegrationStatsLegacyAndReplace(t *testing.T) {
	db := testDB(t)
	s := newIntegrationService(t, db)
	ctx := context.Background()

	legacy := models.MailAccount{Provider: providers.NameMailTM, AccountID: "legacy-1", Email: "qa_test_ab12cd34@uberip.com",
		Password: "pw", Domain: "uberip.com", Status: models.StatusAvailable, Tag: "login", Note: "old"}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.GenerateAccount(ctx, GenerateAccountInput{}); err != nil {
		t.Fatal(err)
	}

	stats, err := s.Stats(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Legacy != 1 || len(stats.ByProvider) != 2 {
		t.Fatalf("unexpected stats %+v", stats)
	}

	list, meta, err := s.ListAccounts(ctx, ListAccountsParams{Legacy: true})
	if err != nil || meta.Total != 1 || !list[0].LegacyName {
		t.Fatalf("legacy filter: %+v %+v %v", list, meta, err)
	}
	if _, meta, _ := s.ListAccounts(ctx, ListAccountsParams{Provider: "LOCAL"}); meta.Total != 1 {
		t.Fatalf("provider filter: %+v", meta)
	}

	replaced, err := s.ReplaceAccount(ctx, legacy.ID)
	if err != nil {
		t.Fatal(err)
	}
	if replaced.Account.Provider != providers.NameMailTM || replaced.Account.Tag != "login" || replaced.Account.LegacyName {
		t.Fatalf("unexpected replacement %+v", replaced.Account)
	}
	old, _ := s.GetAccount(ctx, legacy.ID)
	if old.Status != models.StatusBlocked {
		t.Fatalf("old account should be BLOCKED, got %s", old.Status)
	}
}

func crlfBytes(s string) []byte { return []byte(strings.ReplaceAll(s, "\n", "\r\n")) }
