package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"qa-mail-manager/internal/mailtm"
	"qa-mail-manager/internal/services"
)

func TestErrorStatus(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		fallback int
		want     int
	}{
		{"malformed id", errInvalidAccountID, http.StatusInternalServerError, http.StatusBadRequest},
		{"validation", fmt.Errorf("%w: tag too long", services.ErrInvalidInput), http.StatusBadGateway, http.StatusBadRequest},
		{"unknown account", services.ErrAccountNotFound, http.StatusBadGateway, http.StatusNotFound},
		{"message gone on Mail.tm", &mailtm.APIError{StatusCode: http.StatusNotFound}, http.StatusBadGateway, http.StatusNotFound},
		{"other Mail.tm failure", &mailtm.APIError{StatusCode: http.StatusTooManyRequests}, http.StatusBadGateway, http.StatusBadGateway},
		{"wrapped Mail.tm 404", fmt.Errorf("fetch: %w", &mailtm.APIError{StatusCode: http.StatusNotFound}), http.StatusBadGateway, http.StatusNotFound},
		{"unexpected", errors.New("boom"), http.StatusInternalServerError, http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := errorStatus(tt.err, tt.fallback); got != tt.want {
				t.Fatalf("errorStatus() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestErrorCode(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		status     int
		wantCode   string
		wantParams bool
	}{
		{"malformed id", errInvalidAccountID, http.StatusBadRequest, codeInvalidAccountID, false},
		{"uncoded validation", fmt.Errorf("%w: something", services.ErrInvalidInput), http.StatusBadRequest, codeInvalidInput, false},
		{"unknown account", services.ErrAccountNotFound, http.StatusNotFound, codeAccountNotFound, false},
		{"message gone", &mailtm.APIError{StatusCode: http.StatusNotFound}, http.StatusNotFound, codeMessageNotFound, false},
		{"Mail.tm failure", &mailtm.APIError{StatusCode: http.StatusTooManyRequests}, http.StatusBadGateway, codeUpstream, false},
		{"unexpected", errors.New("boom"), http.StatusInternalServerError, codeInternal, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, params := errorCode(tt.err, tt.status)
			if code != tt.wantCode || (params != nil) != tt.wantParams {
				t.Fatalf("errorCode() = %q, %v; want %q", code, params, tt.wantCode)
			}
		})
	}
}
