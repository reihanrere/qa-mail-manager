package handlers

import (
	"net/http"

	"github.com/gofiber/fiber/v3"

	"qa-mail-manager/internal/services"
	"qa-mail-manager/internal/utils"
)

// InboxHandler exposes HTTP handlers for reading a Mail.tm account's inbox.
// Unrecognised failures are reported as 502 because they come from Mail.tm.
type InboxHandler struct {
	service *services.AccountService
}

// NewInboxHandler builds an InboxHandler with its service dependency injected.
func NewInboxHandler(service *services.AccountService) *InboxHandler {
	return &InboxHandler{service: service}
}

// ListMessages handles GET /api/accounts/:id/messages?page=&search=.
func (h *InboxHandler) ListMessages(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}

	page := fiber.Query[int](c, "page", 1)
	inbox, err := h.service.GetInbox(c.Context(), id, page, c.Query("search"))
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.SuccessWithMeta(c, http.StatusOK, "Success", inbox.Messages, inbox.Meta)
}

// GetMessageDetail handles GET /api/accounts/:id/messages/:messageId.
func (h *InboxHandler) GetMessageDetail(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}

	message, err := h.service.GetMessageDetail(c.Context(), id, c.Params("messageId"))
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.Success(c, http.StatusOK, "Success", message)
}

// MarkMessageRead handles PATCH /api/accounts/:id/messages/:messageId/read.
func (h *InboxHandler) MarkMessageRead(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}

	if err := h.service.MarkMessageRead(c.Context(), id, c.Params("messageId")); err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.Success(c, http.StatusOK, "Success", fiber.Map{"seen": true})
}

// DeleteMessage handles DELETE /api/accounts/:id/messages/:messageId.
func (h *InboxHandler) DeleteMessage(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}

	if err := h.service.DeleteMessage(c.Context(), id, c.Params("messageId")); err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.Success(c, http.StatusOK, "Success", nil)
}
