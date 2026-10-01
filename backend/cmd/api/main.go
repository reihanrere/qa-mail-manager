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
	"qa-mail-manager/internal/providers"
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

	accountService, err := services.NewAccountService(db, services.Settings{
		DefaultProvider: cfg.MailProvider,
		Limits:          services.Limits{TagMaxLength: cfg.TagMaxLength, NoteMaxLength: cfg.NoteMaxLength},

		UsernameMaxAttempts:   cfg.UsernameMaxAttempts,
		FirstNames:            cfg.UsernameFirstNames,
		LastNames:             cfg.UsernameLastNames,
		LegacyUsernamePattern: cfg.LegacyUsernamePattern,

		InboxSearchMaxPages: cfg.InboxSearchMaxPages,
		InboxSyncInterval:   cfg.InboxSyncInterval,
		MailTMRequestDelay:  cfg.MailTMRequestDelay,

		MessageRetention:     cfg.MessageRetention,
		MessagePruneInterval: cfg.MessagePruneInterval,

		IngestEnabled: cfg.IngestSecret != "",
	},
		providers.NewMailTM(mailtmService),
		providers.NewLocal(db, cfg.CatchallDomain),
	)
	if err != nil {
		log.Fatalf("invalid service settings: %v", err)
	}
	if err := accountService.LoadSettingOverrides(context.Background()); err != nil {
		log.Printf("settings: %v", err)
	}
	accountService.StartInboxSync(context.Background())
	accountService.StartMessagePruner(context.Background())

	accountHandler := handlers.NewAccountHandler(accountService)
	inboxHandler := handlers.NewInboxHandler(accountService)
	eventsHandler := handlers.NewEventsHandler(accountService.Events(), cfg.EventsHeartbeatInterval)

	if cfg.IngestSecret != "" {
		startIngestServer(cfg, accountService)
	} else {
		log.Println("ingest: disabled (INGEST_SECRET is empty)")
	}

	app := fiber.New(fiber.Config{
		AppName: cfg.AppName,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New())

	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	routes.RegisterRoutes(app, accountHandler, inboxHandler, eventsHandler)
	routes.RegisterDocsRoutes(app)

	log.Printf("%s listening on port %s", cfg.AppName, cfg.AppPort)
	if err := app.Listen(":" + cfg.AppPort); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// startIngestServer serves only the ingest endpoint on its own port, so the Cloudflare
// tunnel can be pointed at it without exposing the rest of the API.
func startIngestServer(cfg *config.Config, accountService *services.AccountService) {
	app := fiber.New(fiber.Config{
		AppName:   cfg.AppName + " ingest",
		BodyLimit: cfg.IngestMaxBytes,
	})
	app.Use(recover.New())
	app.Use(logger.New())
	routes.RegisterIngestRoutes(app, handlers.NewIngestHandler(accountService, cfg.IngestSecret))

	go func() {
		log.Printf("ingest listening on port %s", cfg.IngestPort)
		if err := app.Listen(":" + cfg.IngestPort); err != nil {
			log.Fatalf("ingest server error: %v", err)
		}
	}()
}
