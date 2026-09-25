package handlers

import (
	"net/http"

	"github.com/gofiber/fiber/v3"

	"qa-mail-manager/internal/services"
	"qa-mail-manager/internal/utils"
)

// AccountHandler exposes HTTP handlers for Mail.tm account management.
type AccountHandler struct {
	service *services.AccountService
}

// NewAccountHandler builds an AccountHandler with its service dependency injected.
func NewAccountHandler(service *services.AccountService) *AccountHandler {
	return &AccountHandler{service: service}
}

// generateRequest is the optional body for POST /api/accounts/generate.
type generateRequest struct {
	Tag  string `json:"tag"`
	Note string `json:"note"`
}

// updateAccountRequest is the body for PATCH /api/accounts/:id; omitted fields are unchanged.
type updateAccountRequest struct {
	Tag  *string `json:"tag"`
	Note *string `json:"note"`
}

// updateStatusRequest is the body for PATCH /api/accounts/:id/status.
type updateStatusRequest struct {
	Status string `json:"status"`
}

// Generate handles POST /api/accounts/generate.
func (h *AccountHandler) Generate(c fiber.Ctx) error {
	var body generateRequest
	// The body is optional; only parse it when one was sent
	if len(c.Body()) > 0 {
		if err := c.Bind().Body(&body); err != nil {
			return utils.Error(c, http.StatusBadRequest, "invalid request body", nil)
		}
	}

	input := services.GenerateAccountInput{Tag: body.Tag, Note: body.Note}
	account, err := h.service.GenerateAccount(c.Context(), input)
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.Success(c, http.StatusCreated, "Success", account)
}

// List handles GET /api/accounts?search=&status=&sort=&page=&limit=.
func (h *AccountHandler) List(c fiber.Ctx) error {
	params := services.ListAccountsParams{
		Search: c.Query("search"),
		Status: c.Query("status"),
		Sort:   c.Query("sort"),
		Page:   fiber.Query[int](c, "page", 1),
		Limit:  fiber.Query[int](c, "limit", 0),
	}

	accounts, meta, err := h.service.ListAccounts(c.Context(), params)
	if err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	return utils.SuccessWithMeta(c, http.StatusOK, "Success", accounts, meta)
}

// Stats handles GET /api/accounts/stats.
func (h *AccountHandler) Stats(c fiber.Ctx) error {
	stats, err := h.service.Stats(c.Context())
	if err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	return utils.Success(c, http.StatusOK, "Success", stats)
}

// Get handles GET /api/accounts/:id.
func (h *AccountHandler) Get(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}

	account, err := h.service.GetAccount(c.Context(), id)
	if err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	return utils.Success(c, http.StatusOK, "Success", account)
}

// Update handles PATCH /api/accounts/:id.
func (h *AccountHandler) Update(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}

	var body updateAccountRequest
	if err := c.Bind().Body(&body); err != nil {
		return utils.Error(c, http.StatusBadRequest, "invalid request body", nil)
	}

	input := services.UpdateAccountInput{Tag: body.Tag, Note: body.Note}
	account, err := h.service.UpdateAccount(c.Context(), id, input)
	if err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	return utils.Success(c, http.StatusOK, "Success", account)
}

// UpdateStatus handles PATCH /api/accounts/:id/status.
func (h *AccountHandler) UpdateStatus(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}

	var body updateStatusRequest
	if err := c.Bind().Body(&body); err != nil {
		return utils.Error(c, http.StatusBadRequest, "invalid request body", nil)
	}

	if err := h.service.UpdateStatus(c.Context(), id, body.Status); err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	return utils.Success(c, http.StatusOK, "Success", nil)
}

// Delete handles DELETE /api/accounts/:id.
func (h *AccountHandler) Delete(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}

	if err := h.service.DeleteAccount(c.Context(), id); err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	return utils.Success(c, http.StatusOK, "Success", nil)
}
