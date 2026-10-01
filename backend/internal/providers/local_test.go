package providers

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"qa-mail-manager/internal/models"
)

func TestLocalPickDomain(t *testing.T) {
	if _, err := NewLocal(nil, "  ").PickDomain(context.Background()); err == nil {
		t.Fatal("expected an error when CATCHALL_DOMAIN is empty")
	}
	got, err := NewLocal(nil, " Re-Testing.ME ").PickDomain(context.Background())
	if err != nil || got != "re-testing.me" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestLocalMultipleDomains(t *testing.T) {
	p := NewLocal(nil, "a.test", " B.test ", "a.test", "")
	domains, err := p.Domains(context.Background())
	if err != nil || strings.Join(domains, ",") != "a.test,b.test" {
		t.Fatalf("got %v, %v", domains, err)
	}
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		d, _ := p.PickDomain(context.Background())
		seen[d] = true
	}
	if !seen["a.test"] || !seen["b.test"] {
		t.Fatalf("PickDomain should spread over every domain, saw %v", seen)
	}
}

func TestLocalCreateAddressReturnsUniqueIDs(t *testing.T) {
	p := NewLocal(nil, "re-testing.me")
	a, _ := p.CreateAddress(context.Background(), "a@re-testing.me", "pw")
	b, _ := p.CreateAddress(context.Background(), "a@re-testing.me", "pw")
	if a == "" || a == b {
		t.Fatalf("expected distinct non-empty ids, got %q and %q", a, b)
	}
}

func TestLocalRejectsMalformedMessageIDWithoutQuery(t *testing.T) {
	// A nil db would panic if queried, so these prove the id is validated first
	p := NewLocal(nil, "re-testing.me")
	account := &models.MailAccount{ID: uuid.New()}
	if _, err := p.GetMessage(context.Background(), account, "not-a-uuid"); err != ErrMessageNotFound {
		t.Fatalf("GetMessage: got %v", err)
	}
	if err := p.MarkSeen(context.Background(), account, "not-a-uuid"); err != ErrMessageNotFound {
		t.Fatalf("MarkSeen: got %v", err)
	}
	if err := p.Delete(context.Background(), account, "../etc"); err != ErrMessageNotFound {
		t.Fatalf("Delete: got %v", err)
	}
}

func TestToSummaryAndDetail(t *testing.T) {
	created := time.Date(2026, 10, 1, 17, 30, 0, 0, time.FixedZone("WIB", 7*3600))
	m := models.Message{
		ID:          uuid.New(),
		FromName:    "Shop",
		FromAddress: "no-reply@shop.example",
		ToAddress:   "rinda.saputra91@re-testing.me",
		Subject:     "Your code",
		Text:        "Use\n\n 482913   to sign in. " + strings.Repeat("x", 200),
		Seen:        true,
		CreatedAt:   created,
	}

	s := toSummary(m)
	if s.ID != m.ID.String() || s.From.Address != m.FromAddress || !s.Seen {
		t.Fatalf("unexpected summary %+v", s)
	}
	if s.CreatedAt != "2026-10-01T10:30:00Z" {
		t.Fatalf("expected UTC RFC3339, got %q", s.CreatedAt)
	}
	if !strings.HasPrefix(s.Intro, "Use 482913 to sign in. ") || len([]rune(s.Intro)) != introLength {
		t.Fatalf("unexpected intro %q", s.Intro)
	}

	d := toDetail(m)
	if d.HTML == nil || len(d.HTML) != 0 {
		t.Fatalf("expected empty non-nil HTML for a text-only message, got %#v", d.HTML)
	}
	if len(d.To) != 1 || d.To[0].Address != m.ToAddress {
		t.Fatalf("unexpected recipients %+v", d.To)
	}
	m.HTML = "<p>hi</p>"
	if got := toDetail(m).HTML; len(got) != 1 || got[0] != m.HTML {
		t.Fatalf("unexpected HTML %#v", got)
	}
}

func TestPreviewFallsBackToHTML(t *testing.T) {
	m := models.Message{HTML: "<style>p{color:red}</style><p>Kode&nbsp;<b>551 204</b> &amp; info</p>"}
	if got := intro(previewText(m)); got != "Kode 551 204 & info" {
		t.Fatalf("got %q", got)
	}
}

func TestIntroKeepsShortText(t *testing.T) {
	if got := intro("  hello \n world "); got != "hello world" {
		t.Fatalf("got %q", got)
	}
}
