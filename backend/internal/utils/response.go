package utils

import "github.com/gofiber/fiber/v3"

// response is the consistent JSON envelope returned by every endpoint.
type response struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
	Meta    any    `json:"meta,omitempty"`
	// Code and Params let clients show a translated message instead of Message.
	Code   string         `json:"code,omitempty"`
	Params map[string]any `json:"params,omitempty"`
}

// Success writes a 200-family success envelope.
func Success(c fiber.Ctx, status int, message string, data any) error {
	return c.Status(status).JSON(response{
		Success: true,
		Message: message,
		Data:    data,
	})
}

// SuccessWithMeta writes a success envelope carrying extra metadata such as pagination.
func SuccessWithMeta(c fiber.Ctx, status int, message string, data any, meta any) error {
	return c.Status(status).JSON(response{
		Success: true,
		Message: message,
		Data:    data,
		Meta:    meta,
	})
}

// Error writes a failure envelope with the given HTTP status. code is a stable
// snake_case identifier; params fill the placeholders of its translation.
func Error(c fiber.Ctx, status int, code, message string, params map[string]any) error {
	return c.Status(status).JSON(response{
		Success: false,
		Message: message,
		Code:    code,
		Params:  params,
	})
}
