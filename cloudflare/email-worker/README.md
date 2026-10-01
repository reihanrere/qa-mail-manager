# Email Worker

Receives every email for the catch-all domain from Cloudflare Email Routing and forwards the raw
message to the backend's ingest server through a Cloudflare tunnel. The backend stores it for the
matching `local` account, or answers 404 so the Worker rejects mail for unknown addresses.

```
sender ──SMTP──▶ Cloudflare Email Routing ──▶ this Worker ──HTTPS──▶ tunnel ──▶ backend:INGEST_PORT ──▶ Postgres
```

## Offline queue

When the backend cannot be reached (laptop asleep, Docker stopped), the message is stored in the
`PENDING` KV namespace instead of failing, and a cron trigger re-delivers queued messages every
5 minutes, oldest first, once the backend is back. Messages wait up to `PENDING_TTL_SECONDS`
(7 days). Addresses that were never generated are dropped at retry time instead of bounced.

Cron triggers need the account's workers.dev subdomain to exist (the Worker itself stays
unreachable over HTTP because of `workers_dev = false`): open **Workers & Pages** in the Cloudflare
dashboard once, then deploy again.

## Configuration

| Name            | Where                       | Value                                                           |
| --------------- | --------------------------- | --------------------------------------------------------------- |
| `INGEST_URL`    | `wrangler.toml` `[vars]`    | `https://<tunnel hostname>/api/ingest`                          |
| `INGEST_SECRET` | `wrangler secret put`       | Same value as `INGEST_SECRET` in the project's `.env`           |
| `FORWARD_TO`    | `wrangler.toml` `[vars]`    | Optional verified address that also receives a copy             |
| `PENDING`       | `wrangler.toml` KV binding  | Queue for offline delivery (`npx wrangler kv namespace create PENDING`) |
| `PENDING_TTL_SECONDS` / `RETRY_BATCH_SIZE` | `[vars]` | Queue lifetime and messages retried per cron run      |

## Deploy

```bash
cd cloudflare/email-worker
npm install
npx wrangler login
npm run secret      # paste the same INGEST_SECRET as in .env
npm run deploy
```

Then in the Cloudflare dashboard: **Email → Email Routing → Routing rules → Catch-all address →
Edit → Action: Send to a Worker → `qa-mail-ingest` → Save**.

`npm run tail` streams the Worker's logs while you send a test email. `npm test` runs the unit tests.
