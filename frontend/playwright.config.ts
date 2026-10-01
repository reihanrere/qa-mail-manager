import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against a running stack (`docker compose up -d`), using the installed
 * Google Chrome so no browser download is needed. See e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    channel: 'chrome',
    headless: process.env.E2E_HEADED !== '1',
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },
})
