package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
)

func TestIngestRejectsMissingOrWrongSecret(t *testing.T) {
	secret := strings.Repeat("s", 32)
	app := fiber.New()
	// The service is never reached when authentication or the body check fails
	app.Post("/api/ingest", NewIngestHandler(nil, secret).Ingest)

	tests := []struct {
		name   string
		secret string
		body   string
		want   int
	}{
		{name: "missing secret", body: "x", want: http.StatusUnauthorized},
		{name: "wrong secret", secret: strings.Repeat("x", 32), body: "x", want: http.StatusUnauthorized},
		{name: "empty body", secret: secret, want: http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/ingest", strings.NewReader(tt.body))
			if tt.secret != "" {
				req.Header.Set(HeaderIngestSecret, tt.secret)
			}
			resp, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			if resp.StatusCode != tt.want {
				t.Fatalf("got %d, want %d", resp.StatusCode, tt.want)
			}
		})
	}
}

func TestIngestDisabledWithoutSecret(t *testing.T) {
	app := fiber.New()
	app.Post("/api/ingest", NewIngestHandler(nil, "").Ingest)
	resp, err := app.Test(httptest.NewRequest(http.MethodPost, "/api/ingest", strings.NewReader("x")))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("an empty configured secret must never authenticate, got %d", resp.StatusCode)
	}
}

func TestInlineSafe(t *testing.T) {
	for contentType, want := range map[string]bool{
		"image/png":                 true,
		"text/plain; charset=utf-8": true,
		"image/svg+xml":             false,
		"text/html":                 false,
		"application/pdf":           false,
		"application/octet-stream":  false,
	} {
		if got := inlineSafe(contentType); got != want {
			t.Errorf("%s: got %v, want %v", contentType, got, want)
		}
	}
}
