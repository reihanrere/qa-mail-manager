package handlers

import (
	"crypto/subtle"
	"errors"
	"log"
	"net/http"

	"github.com/gofiber/fiber/v3"

	"qa-mail-manager/internal/ingest"
	"qa-mail-manager/internal/services"
	"qa-mail-manager/internal/utils"
)

// Headers set by the Cloudflare Email Worker.
const (
	HeaderIngestSecret = "X-Ingest-Secret"
	HeaderEnvelopeTo   = "X-Envelope-To"
)

// IngestHandler receives raw emails from the Cloudflare Email Worker.
type IngestHandler struct {
	service *services.AccountService
	secret  []byte
}

// NewIngestHandler builds an IngestHandler that only accepts requests carrying secret.
func NewIngestHandler(service *services.AccountService, secret string) *IngestHandler {
	return &IngestHandler{service: service, secret: []byte(secret)}
}

// Ingest handles POST /api/ingest with a raw RFC 5322 message as the body.
// 404 tells the Worker to reject mail for unknown addresses; 5xx makes it retry.
func (h *IngestHandler) Ingest(c fiber.Ctx) error {
	if len(h.secret) == 0 || subtle.ConstantTimeCompare([]byte(c.Get(HeaderIngestSecret)), h.secret) != 1 {
		return utils.Error(c, http.StatusUnauthorized, "invalid ingest secret", nil)
	}
	body := c.Body()
	if len(body) == 0 {
		return utils.Error(c, http.StatusBadRequest, "empty body", nil)
	}

	result, err := h.service.IngestMessage(c.Context(), body, c.Get(HeaderEnvelopeTo))
	switch {
	case errors.Is(err, services.ErrRecipientNotFound):
		return utils.Error(c, http.StatusNotFound, err.Error(), nil)
	case errors.Is(err, ingest.ErrMalformed):
		return utils.Error(c, http.StatusUnprocessableEntity, err.Error(), nil)
	case err != nil:
		log.Printf("ingest: %v", err)
		return utils.Error(c, http.StatusInternalServerError, "failed to store message", nil)
	}

	status := http.StatusCreated
	if result.Duplicate {
		status = http.StatusOK
	}
	return utils.Success(c, status, "Success", result)
}
