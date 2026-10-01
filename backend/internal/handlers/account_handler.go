package handlers

import (
	"bytes"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v3"

	"qa-mail-manager/internal/services"
	"qa-mail-manager/internal/utils"
)

// AccountHandler exposes HTTP handlers for mailbox account management.
type AccountHandler struct {
	service *services.AccountService
}

// NewAccountHandler builds an AccountHandler with its service dependency injected.
func NewAccountHandler(service *services.AccountService) *AccountHandler {
	return &AccountHandler{service: service}
}

// generateRequest is the optional body for POST /api/accounts/generate.
type generateRequest struct {
	Tag      string `json:"tag"`
	Note     string `json:"note"`
	Provider string `json:"provider"`
	Domain   string `json:"domain"`
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

	input := services.GenerateAccountInput{Tag: body.Tag, Note: body.Note, Provider: body.Provider, Domain: body.Domain}
	account, err := h.service.GenerateAccount(c.Context(), input)
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.Success(c, http.StatusCreated, "Success", account)
}

// Settings handles GET /api/settings: providers with their domains, label limits,
// inbox options and the editable settings with their environment defaults.
func (h *AccountHandler) Settings(c fiber.Ctx) error {
	settings, err := h.service.AppSettings(c.Context())
	if err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	return utils.Success(c, http.StatusOK, "Success", settings)
}

// UpdateSettings handles PATCH /api/settings with {"values": {...}, "reset": [...]}.
func (h *AccountHandler) UpdateSettings(c fiber.Ctx) error {
	var patch services.SettingsPatch
	if err := c.Bind().Body(&patch); err != nil {
		return utils.Error(c, http.StatusBadRequest, "invalid request body", nil)
	}
	if err := h.service.UpdateSettings(c.Context(), patch); err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	return h.Settings(c)
}

// Replace handles POST /api/accounts/:id/replace: a new address with the same labels,
// the old account is marked BLOCKED.
func (h *AccountHandler) Replace(c fiber.Ctx) error {
	id, err := parseAccountID(c)
	if err != nil {
		return respondError(c, err, http.StatusBadRequest)
	}
	result, err := h.service.ReplaceAccount(c.Context(), id)
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.Success(c, http.StatusCreated, "Success", result)
}

// bulkGenerateRequest is the body for POST /api/accounts/generate/bulk.
type bulkGenerateRequest struct {
	generateRequest
	Count int `json:"count"`
}

// GenerateBulk handles POST /api/accounts/generate/bulk.
func (h *AccountHandler) GenerateBulk(c fiber.Ctx) error {
	var body bulkGenerateRequest
	if err := c.Bind().Body(&body); err != nil {
		return utils.Error(c, http.StatusBadRequest, "invalid request body", nil)
	}
	input := services.GenerateAccountInput{Tag: body.Tag, Note: body.Note, Provider: body.Provider, Domain: body.Domain}
	result, err := h.service.GenerateAccounts(c.Context(), input, body.Count)
	if err != nil {
		return respondError(c, err, http.StatusBadGateway)
	}
	return utils.Success(c, http.StatusCreated, "Success", result)
}

// Export handles GET /api/accounts/export: the filtered list as a CSV download.
func (h *AccountHandler) Export(c fiber.Ctx) error {
	params := listParams(c)
	var buf bytes.Buffer
	if err := h.service.ExportAccountsCSV(c.Context(), params, &buf); err != nil {
		return respondError(c, err, http.StatusInternalServerError)
	}
	filename := "qa-mail-accounts-" + time.Now().Format("20060102-150405") + ".csv"
	c.Set(fiber.HeaderContentType, "text/csv; charset=utf-8")
	c.Set(fiber.HeaderContentDisposition, `attachment; filename="`+filename+`"`)
	return c.Send(buf.Bytes())
}

// listParams reads the shared list/export filters from the query string.
func listParams(c fiber.Ctx) services.ListAccountsParams {
	return services.ListAccountsParams{
		Search:   c.Query("search"),
		Status:   c.Query("status"),
		Provider: c.Query("provider"),
		Legacy:   fiber.Query[bool](c, "legacy", false),
		Sort:     c.Query("sort"),
		Page:     fiber.Query[int](c, "page", 1),
		Limit:    fiber.Query[int](c, "limit", 0),
	}
}

// List handles GET /api/accounts?search=&status=&sort=&page=&limit=.
func (h *AccountHandler) List(c fiber.Ctx) error {
	params := listParams(c)

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
