# QA Mail Manager — Backend

Internal backend service for managing [Mail.tm](https://mail.tm) accounts used for QA/testing purposes (e.g. registration flows that require a real inbox, such as IndiHome sign-up).

The backend acts as a **proxy** between the frontend and the Mail.tm API. The frontend never sees a Mail.tm password or JWT — it only talks to this backend's own REST API.

## Tech Stack

- Go 1.25+
- [Fiber v3](https://docs.gofiber.io/) — HTTP framework
- [GORM](https://gorm.io/) — ORM with `AutoMigrate`
- PostgreSQL
- [Viper](https://github.com/spf13/viper) — configuration
- [google/uuid](https://github.com/google/uuid)
- [Air](https://github.com/air-verse/air) — hot reload for local development

## Folder Structure

```
backend/
├── cmd/
│   └── api/
│       └── main.go            # composition root: config, DB, Mail.tm client, DI, routes
├── internal/
│   ├── config/
│   │   └── config.go          # Viper-based config loader
│   ├── database/
│   │   └── database.go        # GORM/Postgres connection + AutoMigrate
│   ├── handlers/
│   │   ├── account_handler.go # account HTTP handlers
│   │   ├── inbox_handler.go   # inbox HTTP handlers
│   │   └── errors.go          # error → HTTP status mapping, :id parsing
│   ├── mailtm/
│   │   ├── client.go          # raw net/http wrapper around the Mail.tm API
│   │   ├── dto.go             # Mail.tm request/response structs
│   │   ├── service.go         # orchestration (pick domain, register, fetch inbox)
│   │   └── token_cache.go     # in-memory JWT cache with re-login on 401
│   ├── models/
│   │   └── mail_account.go    # MailAccount GORM model
│   ├── routes/
│   │   └── routes.go          # route registration
│   ├── services/
│   │   ├── account_service.go # accounts: generate, list/search/paginate, stats, edit
│   │   └── inbox_service.go   # inbox: pages, search, read/delete, background sync
│   └── utils/
│       └── response.go        # Success/Error response helpers
├── .env.example
├── go.mod
└── README.md
```

## PostgreSQL Setup

1. Make sure PostgreSQL is installed and running locally.
2. Create the database:
   ```bash
   psql -U postgres -c "CREATE DATABASE qa_mail_manager"
   ```
3. Enable the `pgcrypto` extension (required for `gen_random_uuid()` used as the primary key default):
   ```bash
   psql -U postgres -d qa_mail_manager -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   ```
4. The `mail_accounts` table is created automatically on startup via GORM `AutoMigrate` — no manual migration needed.

## Environment Setup

Copy the example env file and adjust as needed:

```bash
cp .env.example .env
```

```env
APP_NAME=QA Mail Manager
APP_PORT=8080

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=qa_mail_manager

MAILTM_BASE_URL=https://api.mail.tm

# How often every account's newest-message time is refreshed (Go duration, 0 disables)
INBOX_SYNC_INTERVAL=2m
```

`INBOX_SYNC_INTERVAL` drives the background inbox sync that lets the inbox list accounts with the most
recent mail first. Each run logs in to every account and reads its first inbox page, spaced out to stay
under Mail.tm's rate limit (~8 requests/second), so very large account lists take a while per cycle.

## Running the Project

```bash
go mod tidy
go run cmd/api/main.go
```

The API will be available at `http://localhost:8080` (or whatever `APP_PORT` is set to).

### Tests

```bash
go test ./...
```

The tests cover input validation, pagination parameters, inbox search, the Mail.tm token cache and
the mapping of errors to HTTP status codes (400 invalid input, 404 unknown account or message, 502 Mail.tm failure).
Mail.tm is replaced by an `httptest` server, so no network or database is needed.

### Hot reload (development)

```bash
go install github.com/air-verse/air@latest
air
```

## API Documentation (Swagger / OpenAPI)

The full OpenAPI 3.0 spec lives at [`docs/openapi.yaml`](docs/openapi.yaml). With the server running, browse it interactively at:

```
http://localhost:8080/docs
```

The raw spec file is served at `http://localhost:8080/docs/openapi.yaml`.

## API Endpoints

### Health

| Method | Endpoint  | Description  |
| ------ | --------- | ------------ |
| GET    | `/health` | Health check |

### Account

| Method | Endpoint                   | Description                                                  |
| ------ | -------------------------- | ------------------------------------------------------------ |
| POST   | `/api/accounts/generate`   | Generate a Mail.tm account; optional `tag` (≤50) and `note` (≤500) |
| GET    | `/api/accounts`            | List accounts, paginated (see query parameters below)        |
| GET    | `/api/accounts/stats`      | Account counts per status and per domain                     |
| GET    | `/api/accounts/:id`        | Get a single account                                         |
| PATCH  | `/api/accounts/:id`        | Edit `tag` and/or `note` (omitted fields are unchanged)      |
| PATCH  | `/api/accounts/:id/status` | Update an account's status                                   |
| DELETE | `/api/accounts/:id`        | Delete an account (database only)                            |

`GET /api/accounts` query parameters:

| Parameter | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `search`  | Case-insensitive match on email, domain, tag or note                          |
| `status`  | `AVAILABLE`, `USED` or `BLOCKED`                                              |
| `sort`    | `newest` (default) or `latest_message` (most recent inbox activity first)     |
| `page`    | 1-based page number (default 1)                                               |
| `limit`   | Page size (default 20, max 100)                                               |

### Inbox

| Method | Endpoint                                     | Description                                   |
| ------ | -------------------------------------------- | --------------------------------------------- |
| GET    | `/api/accounts/:id/messages`                 | List messages, newest first (`page`, `search`) |
| GET    | `/api/accounts/:id/messages/:messageId`      | Get a single message's full detail            |
| PATCH  | `/api/accounts/:id/messages/:messageId/read` | Mark a message as read on Mail.tm             |
| DELETE | `/api/accounts/:id/messages/:messageId`      | Permanently delete a message on Mail.tm       |

Message pages hold up to 30 messages (Mail.tm's page size). Mail.tm has no search API, so `search`
scans up to 10 pages (the newest 300 messages) and returns all matches at once; `meta.truncated` is
`true` when the scan stopped early.

All responses follow a consistent envelope:

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

Paginated endpoints add a `meta` object:

```json
{
  "success": true,
  "message": "Success",
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 42, "hasMore": true }
}
```

```json
{
  "success": false,
  "message": "Error message",
  "errors": []
}
```

## Example Requests (curl)

```bash
# Health check
curl http://localhost:8080/health

# Generate a new account (tag and note are optional)
curl -X POST http://localhost:8080/api/accounts/generate \
  -H "Content-Type: application/json" \
  -d '{"tag":"login-flow","note":"OTP regression suite"}'

# List accounts: search, filter, sort by latest inbox activity, second page
curl "http://localhost:8080/api/accounts?search=login&status=AVAILABLE&sort=latest_message&page=2&limit=20"

# Account counts per status and domain
curl http://localhost:8080/api/accounts/stats

# Edit tag and/or note
curl -X PATCH http://localhost:8080/api/accounts/<id> \
  -H "Content-Type: application/json" \
  -d '{"note":"Reserved for checkout tests"}'

# Update account status
curl -X PATCH http://localhost:8080/api/accounts/<id>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"USED"}'

# Delete an account
curl -X DELETE http://localhost:8080/api/accounts/<id>

# List inbox messages (page 2, or search)
curl "http://localhost:8080/api/accounts/<id>/messages?page=2"
curl "http://localhost:8080/api/accounts/<id>/messages?search=verification"

# Get a message's full detail
curl http://localhost:8080/api/accounts/<id>/messages/<messageId>

# Mark a message as read
curl -X PATCH http://localhost:8080/api/accounts/<id>/messages/<messageId>/read

# Delete a message (permanent)
curl -X DELETE http://localhost:8080/api/accounts/<id>/messages/<messageId>
```

## Notes

- Mail.tm passwords are stored in PostgreSQL (needed to log in and fetch the inbox on demand) but are **never** serialized in API responses (`Password` field is tagged `json:"-"`).
- Mail.tm JWTs are cached **in process memory only** for up to 30 minutes and are **never persisted** to the database. Mail.tm tokens carry no expiry claim, so a cached token rejected with 401 is dropped and the request is retried once after a fresh login.
- Opening a message on Mail.tm does not mark it as read; the frontend calls the `/read` endpoint when a message is opened.
- Deleting an account only removes the local database row; it does not delete the account on Mail.tm's side.
