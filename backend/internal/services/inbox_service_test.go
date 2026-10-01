package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"qa-mail-manager/internal/mailtm"
	"qa-mail-manager/internal/models"
	"qa-mail-manager/internal/providers"
)

func summary(id, subject, createdAt string) mailtm.MessageSummary {
	m := mailtm.MessageSummary{ID: id, Subject: subject, CreatedAt: createdAt}
	m.From.Name = "Sender " + id
	m.From.Address = id + "@example.com"
	return m
}

func TestSortNewestFirst(t *testing.T) {
	messages := []mailtm.MessageSummary{
		summary("old", "", "2026-09-20T10:00:00+00:00"),
		summary("new", "", "2026-09-22T10:00:00+00:00"),
		// Same instant in another zone sorts by time, not by string
		summary("mid", "", "2026-09-21T17:00:00+07:00"),
	}
	sortNewestFirst(messages)

	got := []string{messages[0].ID, messages[1].ID, messages[2].ID}
	want := []string{"new", "mid", "old"}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestMessageMatches(t *testing.T) {
	m := summary("abc", "Your Verification Code", "2026-09-22T10:00:00+00:00")
	m.Intro = "Use 482913 to sign in"

	for _, term := range []string{"verification", "482913", "sender abc", "abc@example"} {
		if !messageMatches(m, term) {
			t.Errorf("expected %q to match", term)
		}
	}
	if messageMatches(m, "invoice") {
		t.Error("did not expect 'invoice' to match")
	}
}

// newPagedMailTM serves `total` messages, newest first, 30 per page like Mail.tm.
func newPagedMailTM(t *testing.T, total int, subjectFor func(i int) string) (providers.MailProvider, *int) {
	t.Helper()
	pagesServed := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			_ = json.NewEncoder(w).Encode(map[string]string{"token": "jwt"})
		case "/messages":
			pagesServed++
			page, _ := strconv.Atoi(r.URL.Query().Get("page"))
			members := []mailtm.MessageSummary{}
			for i := (page - 1) * mailtm.MessagesPerPage; i < page*mailtm.MessagesPerPage && i < total; i++ {
				// Message 0 is newest
				created := fmt.Sprintf("2026-09-22T%02d:%02d:00+00:00", 23-i/60, 59-i%60)
				members = append(members, summary(strconv.Itoa(i), subjectFor(i), created))
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"hydra:member": members, "hydra:totalItems": total})
		}
	}))
	t.Cleanup(server.Close)
	return providers.NewMailTM(mailtm.NewService(mailtm.NewClient(server.URL))), &pagesServed
}

const testMaxPages = 10

var testAccount = &models.MailAccount{Email: "ayu.putra@example.com", Password: "secret"}

func TestSearchInboxScansAllPages(t *testing.T) {
	svc, pages := newPagedMailTM(t, 70, func(i int) string {
		if i%25 == 0 {
			return "OTP code"
		}
		return "newsletter"
	})

	result, err := searchInbox(context.Background(), svc, testAccount, "otp", testMaxPages)
	if err != nil {
		t.Fatal(err)
	}
	if *pages != 3 {
		t.Fatalf("expected 3 pages scanned for 70 messages, got %d", *pages)
	}
	if len(result.Messages) != 3 || result.Meta.Total != 3 || result.Meta.HasMore || result.Meta.Truncated {
		t.Fatalf("unexpected result: %d messages, meta %+v", len(result.Messages), result.Meta)
	}
	if result.Messages[0].ID != "0" || result.Messages[2].ID != "50" {
		t.Fatalf("expected newest match first, got %s..%s", result.Messages[0].ID, result.Messages[2].ID)
	}
}

func TestSearchInboxStopsAtPageCap(t *testing.T) {
	total := (testMaxPages + 2) * mailtm.MessagesPerPage
	svc, pages := newPagedMailTM(t, total, func(int) string { return "hello" })

	result, err := searchInbox(context.Background(), svc, testAccount, "hello", testMaxPages)
	if err != nil {
		t.Fatal(err)
	}
	if *pages != testMaxPages {
		t.Fatalf("expected scan to stop at %d pages, got %d", testMaxPages, *pages)
	}
	if !result.Meta.Truncated {
		t.Fatal("expected Truncated when the cap is hit")
	}
	if len(result.Messages) != testMaxPages*mailtm.MessagesPerPage {
		t.Fatalf("expected %d matches, got %d", testMaxPages*mailtm.MessagesPerPage, len(result.Messages))
	}
}

func TestSearchInboxEmptyInbox(t *testing.T) {
	svc, _ := newPagedMailTM(t, 0, func(int) string { return "" })

	result, err := searchInbox(context.Background(), svc, testAccount, "anything", testMaxPages)
	if err != nil {
		t.Fatal(err)
	}
	if result.Messages == nil || len(result.Messages) != 0 {
		t.Fatalf("expected an empty, non-nil slice so JSON encodes [], got %#v", result.Messages)
	}
}
