package mailtm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestTokenCacheExpiry(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	cache := newTokenCache(time.Minute)
	cache.now = func() time.Time { return now }

	cache.set("a@example.com", "jwt-1")
	if got, ok := cache.get("a@example.com"); !ok || got != "jwt-1" {
		t.Fatalf("expected cached token, got %q ok=%v", got, ok)
	}

	now = now.Add(time.Minute)
	if _, ok := cache.get("a@example.com"); ok {
		t.Fatal("expected token to expire exactly at TTL")
	}
}

func TestTokenCacheInvalidate(t *testing.T) {
	cache := newTokenCache(time.Hour)
	cache.set("a@example.com", "jwt-1")
	cache.invalidate("a@example.com")
	if _, ok := cache.get("a@example.com"); ok {
		t.Fatal("expected token to be removed")
	}
}

// fakeMailTM issues numbered tokens and accepts only the latest one on /messages.
type fakeMailTM struct {
	logins     atomic.Int32
	validToken atomic.Value
	failLogin  bool
	server     *httptest.Server
}

func newFakeMailTM(t *testing.T) *fakeMailTM {
	t.Helper()
	f := &fakeMailTM{}
	f.validToken.Store("")
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			if f.failLogin {
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{"message": "Invalid credentials."})
				return
			}
			n := f.logins.Add(1)
			token := "jwt-" + string(rune('0'+n))
			f.validToken.Store(token)
			_ = json.NewEncoder(w).Encode(map[string]string{"token": token})
		case "/messages":
			if r.Header.Get("Authorization") != "Bearer "+f.validToken.Load().(string) {
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]string{"message": "Expired JWT Token"})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"hydra:member": []any{}, "hydra:totalItems": 0})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(f.server.Close)
	return f
}

func fetchFirstPage(ctx context.Context, s *Service) error {
	return s.WithToken(ctx, "a@example.com", "secret", func(token string) error {
		_, err := s.FetchInboxPage(ctx, token, 1)
		return err
	})
}

func TestWithTokenReusesCachedToken(t *testing.T) {
	fake := newFakeMailTM(t)
	svc := NewService(NewClient(fake.server.URL))

	for i := 0; i < 3; i++ {
		if err := fetchFirstPage(context.Background(), svc); err != nil {
			t.Fatalf("request %d: %v", i, err)
		}
	}
	if got := fake.logins.Load(); got != 1 {
		t.Fatalf("expected 1 login for 3 requests, got %d", got)
	}
}

func TestWithTokenRetriesOnceWhenCachedTokenIsRejected(t *testing.T) {
	fake := newFakeMailTM(t)
	svc := NewService(NewClient(fake.server.URL))

	if err := fetchFirstPage(context.Background(), svc); err != nil {
		t.Fatal(err)
	}
	// Mail.tm revokes the token behind our back
	fake.validToken.Store("revoked")

	if err := fetchFirstPage(context.Background(), svc); err != nil {
		t.Fatalf("expected transparent re-login, got %v", err)
	}
	if got := fake.logins.Load(); got != 2 {
		t.Fatalf("expected a second login after 401, got %d logins", got)
	}
}

func TestWithTokenDoesNotRetryFreshToken(t *testing.T) {
	fake := newFakeMailTM(t)
	svc := NewService(NewClient(fake.server.URL))
	calls := 0

	err := svc.WithToken(context.Background(), "a@example.com", "secret", func(string) error {
		calls++
		return &APIError{StatusCode: http.StatusUnauthorized, Message: "nope"}
	})
	if !isUnauthorized(err) {
		t.Fatalf("expected the 401 to surface, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("a freshly issued token must not be retried, fn ran %d times", calls)
	}
}

func TestWithTokenReturnsLoginError(t *testing.T) {
	fake := newFakeMailTM(t)
	fake.failLogin = true
	svc := NewService(NewClient(fake.server.URL))

	err := fetchFirstPage(context.Background(), svc)
	var apiErr *APIError
	if err == nil || !isUnauthorized(err) {
		t.Fatalf("expected login 401, got %v (%T)", err, apiErr)
	}
	if _, ok := svc.tokens.get("a@example.com"); ok {
		t.Fatal("a failed login must not be cached")
	}
}
