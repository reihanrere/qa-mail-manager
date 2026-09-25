package routes

import (
	"github.com/gofiber/fiber/v3"

	"qa-mail-manager/internal/handlers"
)

// RegisterRoutes wires all API routes to their handlers.
func RegisterRoutes(app *fiber.App, accountHandler *handlers.AccountHandler, inboxHandler *handlers.InboxHandler) {
	api := app.Group("/api")

	accounts := api.Group("/accounts")
	accounts.Post("/generate", accountHandler.Generate)
	accounts.Get("/", accountHandler.List)
	// Registered before "/:id" so "stats" is not parsed as an account id
	accounts.Get("/stats", accountHandler.Stats)
	accounts.Get("/:id", accountHandler.Get)
	accounts.Patch("/:id", accountHandler.Update)
	accounts.Patch("/:id/status", accountHandler.UpdateStatus)
	accounts.Delete("/:id", accountHandler.Delete)

	accounts.Get("/:id/messages", inboxHandler.ListMessages)
	accounts.Get("/:id/messages/:messageId", inboxHandler.GetMessageDetail)
	accounts.Delete("/:id/messages/:messageId", inboxHandler.DeleteMessage)
	accounts.Patch("/:id/messages/:messageId/read", inboxHandler.MarkMessageRead)
}

// swaggerUIPage renders a minimal Swagger UI shell backed by the CDN bundle,
// pointed at our own openapi.yaml file (no extra Go dependencies required).
const swaggerUIPage = `<!DOCTYPE html>
<html>
  <head>
    <title>QA Mail Manager API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/docs/openapi.yaml",
          dom_id: "#swagger-ui",
        });
      };
    </script>
  </body>
</html>`

// RegisterDocsRoutes serves the Swagger UI at /docs and the raw spec at /docs/openapi.yaml.
func RegisterDocsRoutes(app *fiber.App) {
	app.Get("/docs", func(c fiber.Ctx) error {
		c.Set(fiber.HeaderContentType, fiber.MIMETextHTMLCharsetUTF8)
		return c.SendString(swaggerUIPage)
	})
	app.Get("/docs/openapi.yaml", func(c fiber.Ctx) error {
		return c.SendFile("./docs/openapi.yaml")
	})
}
