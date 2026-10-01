package providers

import (
	"fmt"
	"net/http"
	"testing"

	"qa-mail-manager/internal/mailtm"
)

func TestIsAddressTaken(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "already used", err: &mailtm.APIError{StatusCode: http.StatusUnprocessableEntity, Message: "address: This value is already used."}, want: true},
		{name: "wrapped", err: fmt.Errorf("register: %w", &mailtm.APIError{StatusCode: http.StatusUnprocessableEntity, Message: "This value is already used."}), want: true},
		{name: "other validation error", err: &mailtm.APIError{StatusCode: http.StatusUnprocessableEntity, Message: "address: This value is not a valid email address."}},
		{name: "server error", err: &mailtm.APIError{StatusCode: http.StatusInternalServerError, Message: "already used"}},
		{name: "nil", err: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isAddressTaken(tt.err); got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}
