package main

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"qa-mail-manager/internal/config"
	"qa-mail-manager/internal/database"
	"qa-mail-manager/internal/handlers"
	"qa-mail-manager/internal/mailtm"
	"qa-mail-manager/internal/routes"
	"qa-mail-manager/internal/services"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	mailtmClient := mailtm.NewClient(cfg.MailTMBaseURL)
	mailtmService := mailtm.NewService(mailtmClient)

	accountService := services.NewAccountService(db, mailtmService)
	accountService.StartInboxSync(context.Background(), cfg.InboxSyncInterval)

	accountHandler := handlers.NewAccountHandler(accountService)
	inboxHandler := handlers.NewInboxHandler(accountService)

	app := fiber.New(fiber.Config{
		AppName: cfg.AppName,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New())

	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	routes.RegisterRoutes(app, accountHandler, inboxHandler)
	routes.RegisterDocsRoutes(app)

	log.Printf("%s listening on port %s", cfg.AppName, cfg.AppPort)
	if err := app.Listen(":" + cfg.AppPort); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
