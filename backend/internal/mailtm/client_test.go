package mailtm

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientErrorMessages(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{name: "api platform detail", body: `{"detail":"Not Found"}`, want: "mail.tm error (404): Not Found"},
		{name: "hydra description", body: `{"hydra:description":"address: This value is already used."}`, want: "mail.tm error (404): address: This value is already used."},
		{name: "jwt auth message", body: `{"code":401,"message":"Invalid credentials."}`, want: "mail.tm error (404): Invalid credentials."},
		{name: "unparseable body", body: `<html>oops</html>`, want: "mail.tm error (404): unknown Mail.tm error"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer server.Close()

			_, err := NewClient(server.URL).GetMessageDetail(context.Background(), "jwt", "id")
			var apiErr *APIError
			if !errors.As(err, &apiErr) || apiErr.StatusCode != http.StatusNotFound {
				t.Fatalf("expected *APIError with 404, got %v", err)
			}
			if err.Error() != tt.want {
				t.Fatalf("got %q, want %q", err.Error(), tt.want)
			}
		})
	}
}

func TestMarkMessageSeenSendsMergePatch(t *testing.T) {
	var gotMethod, gotType, gotBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotType = r.Method, r.Header.Get("Content-Type")
		buf := make([]byte, 64)
		n, _ := r.Body.Read(buf)
		gotBody = string(buf[:n])
		_, _ = w.Write([]byte(`{"seen":true}`))
	}))
	defer server.Close()

	if err := NewClient(server.URL).MarkMessageSeen(context.Background(), "jwt", "abc"); err != nil {
		t.Fatal(err)
	}
	if gotMethod != http.MethodPatch || gotType != "application/merge-patch+json" || gotBody != `{"seen":true}` {
		t.Fatalf("unexpected request: %s %s %s", gotMethod, gotType, gotBody)
	}
}
