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

// respondError writes the error envelope with the status chosen by errorStatus.
func respondError(c fiber.Ctx, err error, fallback int) error {
	return utils.Error(c, errorStatus(err, fallback), err.Error(), nil)
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
