package handlers

import (
	"mime"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v3"

	"qa-mail-manager/internal/providers"
	"qa-mail-manager/internal/services"
	"qa-mail-manager/internal/utils"
)

// InboxHandler exposes HTTP handlers for reading an account's inbox.
// Unrecognised failures are reported as 502 because they usually come from Mail.tm.
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

// SendMessage handles POST /api/accounts/:id/messages/send.
func (h *InboxHandler) SendMessage(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}
	var body services.SendMessageInput
	if err := c.Bind().Body(&body); err != nil {
		return utils.Error(c, http.StatusBadRequest, codeInvalidBody, "invalid request body", nil)
	}
	result, err := h.service.SendMessage(c.Context(), id, body)
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.Success(c, http.StatusCreated, "Success", result)
}

// GetAttachment handles GET /api/accounts/:id/messages/:messageId/attachments/:attachmentId.
// ?download=1 forces a download instead of letting the browser display the file.
func (h *InboxHandler) GetAttachment(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}
	file, err := h.service.GetAttachment(c.Context(), id, c.Params("messageId"), c.Params("attachmentId"))
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return sendFile(c, file, fiber.Query[bool](c, "download", false))
}

// GetSource handles GET /api/accounts/:id/messages/:messageId/source: the raw message,
// shown as plain text unless ?download=1.
func (h *InboxHandler) GetSource(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}
	file, err := h.service.GetMessageSource(c.Context(), id, c.Params("messageId"))
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	download := fiber.Query[bool](c, "download", false)
	if !download {
		// Render in the browser tab instead of offering message/rfc822 to a mail client
		file.ContentType = "text/plain; charset=utf-8"
	}
	return sendFile(c, file, download)
}

// sendFile writes a provider file. Untrusted email content is never rendered as HTML
// on our origin: active types are served as downloads and sniffing is disabled.
func sendFile(c fiber.Ctx, file *providers.File, download bool) error {
	contentType := file.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if !download && !inlineSafe(contentType) {
		download = true
	}
	disposition := "inline"
	if download {
		disposition = "attachment"
	}
	c.Set(fiber.HeaderContentType, contentType)
	c.Set(fiber.HeaderContentDisposition, mime.FormatMediaType(disposition, map[string]string{"filename": file.Filename}))
	c.Set(fiber.HeaderXContentTypeOptions, "nosniff")
	c.Set(fiber.HeaderContentSecurityPolicy, "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox")
	return c.Send(file.Data)
}

// inlineSafe lists types a browser can show without running email-supplied code.
func inlineSafe(contentType string) bool {
	mediaType, _, _ := mime.ParseMediaType(contentType)
	switch {
	case strings.HasPrefix(mediaType, "image/") && mediaType != "image/svg+xml":
		return true
	case mediaType == "text/plain":
		return true
	}
	return false
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
