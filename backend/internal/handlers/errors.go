package handlers

import (
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"qa-mail-manager/internal/mailtm"
	"qa-mail-manager/internal/providers"
	"qa-mail-manager/internal/services"
	"qa-mail-manager/internal/utils"
)

// errorStatus maps a service or Mail.tm error to an HTTP status code.
// Unrecognised errors get fallback (e.g. 502 when Mail.tm itself failed).
func errorStatus(err error, fallback int) int {
	var apiErr *mailtm.APIError
	switch {
	case errors.Is(err, errInvalidAccountID), errors.Is(err, services.ErrInvalidInput):
		return http.StatusBadRequest
	case errors.Is(err, services.ErrAccountNotFound), errors.Is(err, providers.ErrMessageNotFound):
		return http.StatusNotFound
	case errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound:
		// e.g. a message id that no longer exists on Mail.tm
		return http.StatusNotFound
	default:
		return fallback
	}
}

// Error codes for failures that are not a services.ValidationError.
const (
	codeInvalidBody      = "invalid_request_body"
	codeInvalidAccountID = "invalid_account_id"
	codeInvalidInput     = "invalid_input"
	codeAccountNotFound  = "account_not_found"
	codeMessageNotFound  = "message_not_found"
	codeUpstream         = "upstream_error"
	codeInternal         = "internal_error"
)

// errorCode picks the code clients translate; params are only set for validation errors.
func errorCode(err error, status int) (string, map[string]any) {
	if v, ok := services.AsValidationError(err); ok {
		return v.Code, v.Params
	}
	switch {
	case errors.Is(err, errInvalidAccountID):
		return codeInvalidAccountID, nil
	case errors.Is(err, services.ErrInvalidInput):
		return codeInvalidInput, nil
	case errors.Is(err, services.ErrAccountNotFound):
		return codeAccountNotFound, nil
	case status == http.StatusNotFound:
		return codeMessageNotFound, nil
	case status == http.StatusBadGateway:
		return codeUpstream, nil
	default:
		return codeInternal, nil
	}
}

// respondError writes the error envelope with the status chosen by errorStatus.
func respondError(c fiber.Ctx, err error, fallback int) error {
	status := errorStatus(err, fallback)
	code, params := errorCode(err, status)
	return utils.Error(c, status, code, err.Error(), params)
}

// errInvalidAccountID is returned by parseAccountID for a malformed :id parameter.
var errInvalidAccountID = errors.New("invalid account id")

// parseAccountID reads the :id route parameter as a UUID.
func parseAccountID(c fiber.Ctx) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return uuid.Nil, errInvalidAccountID
	}
	return id, nil
}
