# QA Mail Manager

Internal tool for generating test email accounts and reading their inboxes (with OTP detection).
Two providers: public [Mail.tm](https://mail.tm), and our own catch-all domain (e.g. `re-testing.me`),
which is not on disposable-email blocklists.

- [`backend/`](backend/README.md) — Go (Fiber + GORM + PostgreSQL) API: proxies Mail.tm and stores own-domain mail
- [`frontend/`](frontend/README.md) — React + Vite app
- [`cloudflare/email-worker/`](cloudflare/email-worker/README.md) — Email Worker that forwards own-domain mail to the backend
- [`tools/test-emails/`](tools/test-emails) — sample emails for manual QA

## Run with Docker (production)

Requires Docker with Compose. From this folder:

```bash
cp .env.example .env      # first time only; set DB_PASSWORD
docker compose up -d --build
```

Open **http://localhost:3000** (change with `WEB_PORT` in `.env`). The app has no login, so it
listens on `127.0.0.1` only; other devices on your network cannot open it unless you set
`WEB_BIND=0.0.0.0` (trusted networks only).

The stack runs these containers:

| Service    | What it is                                                                  | Exposed on the host |
| ---------- | --------------------------------------------------------------------------- | ------------------- |
| `frontend` | nginx serving the production build; forwards `/api`, `/health`, `/docs`     | `WEB_PORT` (3000)   |
| `backend`  | Go API binary (+ ingest-only server on 8081 when `INGEST_SECRET` is set)    | no                  |
| `cloudflared` | Cloudflare tunnel to the ingest server (only with `COMPOSE_PROFILES=tunnel`) | no               |
| `postgres` | PostgreSQL 17 with data in the `qa-mail-manager_postgres-data` volume        | no                  |

API docs (Swagger UI) are at http://localhost:3000/docs.

### Everyday commands

```bash
docker compose up -d --build   # start, rebuilding after code changes
docker compose ps              # status and health
docker compose logs -f backend # follow backend logs (inbox sync, errors)
docker compose down            # stop; data is kept in the volume
```

`docker compose down -v` also deletes the database volume — **all accounts are lost**.

You can run these from any folder with `-f`, e.g.
`docker compose -f ~/path/to/qa-mail-manager/docker-compose.yml up -d`.

### Backup and restore

```bash
# Backup
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' > backup.sql

# Restore into a fresh stack (before the backend first starts, or into an empty database)
docker compose up -d postgres
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup.sql
docker compose up -d
```

The same restore steps move data from a local (non-Docker) PostgreSQL: create `backup.sql` with
`pg_dump -h localhost -U postgres -d qa_mail_manager --no-owner --no-privileges` first.

## Own domain (catch-all) setup

Mail.tm only offers public domains that signup forms detect as temporary email. The `local` provider
uses a domain you own instead:

```
sender ──▶ Cloudflare Email Routing ──▶ Email Worker ──▶ Cloudflare tunnel ──▶ backend:8081 ──▶ Postgres
```

1. **DNS** – add the domain to Cloudflare (Free plan) and point the registrar's nameservers at it.
   Enable **Email → Email Routing** (it adds the MX and SPF records).
2. **Secret** – put `INGEST_SECRET=$(openssl rand -hex 32)` and `CATCHALL_DOMAIN=your-domain` in `.env`.
   Set `MAIL_PROVIDER=local` to make it the default.
3. **Tunnel** – Cloudflare **Zero Trust → Networks → Tunnels → Create (cloudflared)**. Copy the token
   into `TUNNEL_TOKEN`, set `COMPOSE_PROFILES=tunnel`, and add a public hostname such as
   `mail-ingest.your-domain` with service `http://backend:8081`. Only the ingest endpoint listens there.
4. **Worker** – deploy [`cloudflare/email-worker`](cloudflare/email-worker/README.md) with the same secret,
   then set the Email Routing **catch-all** action to **Send to a Worker**.
5. `docker compose up -d --build`. **Settings → Mail Providers** shows whether each provider is available.
6. **Reputation (recommended)** – add a DMARC record so the domain looks maintained to signup
   forms and mail filters: TXT `_dmarc.your-domain` = `v=DMARC1; p=none`. Email Routing already
   added SPF. A simple landing page on the apex domain also helps against "unknown domain" checks.

Several domains can share one setup: list them in `CATCHALL_DOMAIN` (comma-separated) and enable
Email Routing with the same Worker on each. The generate dialog then offers a domain picker.

All tunables are documented in [`.env.example`](.env.example); most behaviour settings can also be
changed live on the **Settings** page.

## Features

- Realistic generated addresses (`rinda.saputra91`), with an "Old format" badge and one-click
  **Replace** for legacy `qa_test_*` accounts
- **Bulk generate** (up to `BULK_GENERATE_MAX` at once) and **CSV export** of the filtered list
  (passwords are never exported)
- Several catch-all domains, with a domain picker when generating
- Provider badge and filter on the accounts list; per-provider breakdown on the dashboard
- **Live updates**: new mail appears instantly with one grouped toast per burst (server-sent
  events), polling as fallback; toasts can be muted per browser
- Message detail: OTP detection, verification / login / reset links with Open and Copy,
  sandboxed HTML with inline (`cid:`) images, attachments, **View source**, and an **Expand**
  modal for wide emails
- **Reply** from own-domain accounts when an SMTP server is configured (`SMTP_*`)
- Account lifecycle rules: mark accounts as used automatically (first email or copied OTP), and
  block or delete accounts that got no mail for a while
- Duplicate guard: Cloudflare retries of the same message are stored once
- Fast database search for own-domain inboxes
- Offline queue in the Email Worker, so mail sent while the laptop is off arrives later
- Most settings editable live on the **Settings** page, without a restart
- Sample emails for QA in [`tools/test-emails`](tools/test-emails) (`send.sh` or `gmail-samples.html`)

## Local development

Run the backend and frontend separately with hot reload; see [`backend/README.md`](backend/README.md)
and [`frontend/README.md`](frontend/README.md). Development uses its own PostgreSQL (from `backend/.env`),
separate from the Docker volume.

Tests: `go test ./...` in `backend/`, `bun run test` in `frontend/`, `npm test` in
`cloudflare/email-worker/` (Node 22), and the Playwright end-to-end test described in
[`frontend/e2e/README.md`](frontend/e2e/README.md).
