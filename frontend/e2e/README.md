# End-to-end tests

Drive the real app in Google Chrome against the running Docker stack:
generate an account in the UI, deliver an OTP email through the ingest endpoint (via the
Cloudflare tunnel), check it appears live, and copy the code.

```bash
docker compose up -d          # from the project root
cd frontend && bun run test:e2e
```

| Variable         | Default                                        |
| ---------------- | ---------------------------------------------- |
| `E2E_BASE_URL`   | `http://localhost:3000`                        |
| `E2E_INGEST_URL` | `https://mail-ingest.re-testing.me/api/ingest` |
| `INGEST_SECRET`  | read from the project's `.env`                 |
| `E2E_HEADED=1`   | show the browser                               |

Accounts created by the test are deleted afterwards.
