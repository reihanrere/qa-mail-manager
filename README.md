# QA Mail Manager

Internal tool for generating [Mail.tm](https://mail.tm) test accounts and reading their inboxes (with OTP detection).

- [`backend/`](backend/README.md) — Go (Fiber + GORM + PostgreSQL) API that proxies Mail.tm
- [`frontend/`](frontend/README.md) — React + Vite app

## Run with Docker (production)

Requires Docker with Compose. From this folder:

```bash
cp .env.example .env      # first time only; set DB_PASSWORD
docker compose up -d --build
```

Open **http://localhost:3000** (change with `WEB_PORT` in `.env`).

The stack runs three containers:

| Service    | What it is                                                                  | Exposed on the host |
| ---------- | --------------------------------------------------------------------------- | ------------------- |
| `frontend` | nginx serving the production build; forwards `/api`, `/health`, `/docs`     | `WEB_PORT` (3000)   |
| `backend`  | Go API binary                                                               | no                  |
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

## Local development

Run the backend and frontend separately with hot reload; see [`backend/README.md`](backend/README.md)
and [`frontend/README.md`](frontend/README.md). Development uses its own PostgreSQL (from `backend/.env`),
separate from the Docker volume.
