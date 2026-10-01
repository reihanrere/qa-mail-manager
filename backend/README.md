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
│       └── main.go            # composition root: config, DB, providers, DI, API + ingest servers
├── internal/
│   ├── config/
│   │   └── config.go          # Viper-based config loader; every tunable and its default
│   ├── database/
│   │   └── database.go        # GORM/Postgres connection + AutoMigrate
│   ├── handlers/
│   │   ├── account_handler.go # account HTTP handlers
│   │   ├── inbox_handler.go   # inbox HTTP handlers
│   │   ├── ingest_handler.go  # POST /api/ingest (ingest server only)
│   │   └── errors.go          # error → HTTP status mapping, :id parsing
│   ├── ingest/
│   │   └── parse.go           # MIME parsing of raw emails from the Email Worker
│   ├── mailtm/
│   │   ├── client.go          # raw net/http wrapper around the Mail.tm API
│   │   ├── dto.go             # Mail.tm request/response structs
│   │   ├── service.go         # orchestration (pick domain, register, fetch inbox)
│   │   └── token_cache.go     # in-memory JWT cache with re-login on 401
│   ├── models/
│   │   ├── mail_account.go    # MailAccount GORM model (with provider column)
│   │   └── message.go         # Message model, stored for local-provider accounts only
│   ├── providers/
│   │   ├── provider.go        # MailProvider interface and shared message types
│   │   ├── mailtm.go          # adapter over the Mail.tm service
│   │   └── local.go           # own catch-all domain: messages read from Postgres
│   ├── routes/
│   │   └── routes.go          # route registration
│   ├── services/
│   │   ├── account_service.go # accounts: generate, list/search/paginate, stats, edit
│   │   ├── inbox_service.go   # inbox: pages, search, read/delete, background sync
│   │   ├── ingest_service.go  # store incoming emails, retention pruner
│   │   ├── settings.go        # runtime settings + GET /api/settings payload
│   │   └── username.go        # human-looking address generator with collision retry
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

Every setting has its default in [`internal/config/config.go`](internal/config/config.go) and is
validated at startup, so a bad value fails fast instead of misbehaving later.

| Variable                 | Default               | Purpose                                                                   |
| ------------------------ | --------------------- | ------------------------------------------------------------------------- |
| `APP_NAME` / `APP_PORT`  | `QA Mail Manager`/`8080` | Name and port of the main API                                          |
| `DB_*`                   |                       | PostgreSQL connection                                                     |
| `MAILTM_BASE_URL`        | `https://api.mail.tm` | Mail.tm API                                                               |
| `INBOX_SYNC_INTERVAL`    | `2m`                  | How often every account's newest-message time is refreshed (0 disables)   |
| `MAILTM_REQUEST_DELAY`   | `400ms`               | Pause between Mail.tm accounts during the sync                            |
| `INBOX_SEARCH_MAX_PAGES` | `10`                  | Pages (30 messages each) an inbox search scans                            |
| `MAIL_PROVIDER`          | `mailtm`              | Default provider for new accounts: `mailtm` or `local`                    |
| `CATCHALL_DOMAIN`        | empty                 | Own catch-all domain for the `local` provider; empty disables generating there |
| `INGEST_SECRET`          | empty                 | Shared with the Email Worker (≥ 32 chars); empty disables the ingest server |
| `INGEST_PORT`            | `8081`                | Ingest-only listener the Cloudflare tunnel points at                      |
| `INGEST_MAX_BYTES`       | `26214400`            | Max raw email size (25 MiB, Email Routing's own limit)                    |
| `MESSAGE_RETENTION`      | `720h`                | Delete stored local messages older than this (0 keeps them)               |
| `MESSAGE_PRUNE_INTERVAL` | `1h`                  | How often retention runs                                                  |
| `USERNAME_MAX_ATTEMPTS`  | `5`                   | Retries when a generated address is taken                                 |
| `USERNAME_FIRST_NAMES` / `USERNAME_LAST_NAMES` | built-in | Comma-separated name pools for generated addresses              |
| `TAG_MAX_LENGTH` / `NOTE_MAX_LENGTH` | `50` / `500` | Label limits; the frontend reads them from `GET /api/settings`      |
| `LEGACY_USERNAME_PATTERN` | `^qa_test_`         | Regexp on the local part that flags old, detectable addresses (empty disables) |
| `EVENTS_HEARTBEAT_INTERVAL` | `20s`             | Keeps the live-update stream (`GET /api/events`) open through proxies     |

Most behaviour settings (default provider, limits, name pools, legacy pattern, sync interval,
Mail.tm delay, search depth, retention) can also be changed on the **Settings** page
(`PATCH /api/settings`). Those values are stored in the `setting_overrides` table, apply
immediately and override the environment until reset. Secrets, ports, the catch-all domain and
the ingest switch stay environment-only.

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

Database-backed integration tests (local inbox lifecycle, settings overrides, stats, replace) run
when `TEST_DATABASE_DSN` points at a disposable PostgreSQL; every table in it is emptied:

```bash
docker run -d --rm --name qamm-test-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:17-alpine
TEST_DATABASE_DSN="host=localhost port=55432 user=postgres password=pw dbname=postgres sslmode=disable" go test ./...
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

### Settings and ingest

| Method | Endpoint        | Description                                                                          |
| ------ | --------------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/settings` | Providers (domain, availability), limits, inbox options, editable settings + their defaults |
| PATCH  | `/api/settings` | `{"values": {...}, "reset": [...]}`: change or reset editable settings              |
| GET    | `/api/events`   | Server-sent events: `message.created`, `accounts.changed`, `settings.changed`        |
| POST   | `/api/ingest`   | **Ingest server only** (`INGEST_PORT`): raw email from the Email Worker, `X-Ingest-Secret` required |

### Account

| Method | Endpoint                   | Description                                                  |
| ------ | -------------------------- | ------------------------------------------------------------ |
| POST   | `/api/accounts/generate`   | Generate an account; optional `tag`, `note` and `provider` (`mailtm`/`local`) |
| GET    | `/api/accounts`            | List accounts, paginated (see query parameters below)        |
| GET    | `/api/accounts/stats`      | Account counts per status and per domain                     |
| GET    | `/api/accounts/:id`        | Get a single account                                         |
| PATCH  | `/api/accounts/:id`        | Edit `tag` and/or `note` (omitted fields are unchanged)      |
| PATCH  | `/api/accounts/:id/status` | Update an account's status                                   |
| DELETE | `/api/accounts/:id`        | Delete an account (database only)                            |
| POST   | `/api/accounts/:id/replace` | New realistic address, same provider/tag/note; old one becomes BLOCKED |

`GET /api/accounts` query parameters:

| Parameter | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `search`  | Case-insensitive match on email, domain, tag or note                          |
| `status`  | `AVAILABLE`, `USED` or `BLOCKED`                                              |
| `provider` | `mailtm` or `local`                                                          |
| `legacy`  | `true` lists only old-format (`LEGACY_USERNAME_PATTERN`) addresses            |
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
- Deleting an account only removes the local database row (and, for `local` accounts, its stored messages); it does not delete the account on Mail.tm's side.
- Generated addresses look like `rinda.saputra91` — no `qa`/`test` markers, because signup forms filter on them. Track QA context in `tag`/`note` instead.
- `local` accounts need no registration: the catch-all accepts every address, and the ingest endpoint answers 404 for addresses that were never generated so the Worker rejects them.
