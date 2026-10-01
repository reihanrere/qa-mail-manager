import { expect, test, type APIRequestContext } from '@playwright/test'
import { envValue } from './env.ts'

// The ingest server is only reachable through the Cloudflare tunnel (or inside Docker)
const INGEST_URL = process.env.E2E_INGEST_URL ?? 'https://mail-ingest.re-testing.me/api/ingest'
const INGEST_SECRET = envValue('INGEST_SECRET')

const createdAccounts: string[] = []

async function ingest(request: APIRequestContext, to: string, subject: string, html: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const raw = [
    'From: "E2E Shop" <noreply@e2e-shop.example>',
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: <${id}@e2e-shop.example>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
  ].join('\r\n')
  const response = await request.post(INGEST_URL, {
    headers: { 'X-Ingest-Secret': INGEST_SECRET!, 'X-Envelope-To': to, 'Content-Type': 'message/rfc822' },
    data: raw,
  })
  expect(response.status(), await response.text()).toBe(201)
}

test.afterAll(async ({ request }) => {
  for (const id of createdAccounts) await request.delete(`/api/accounts/${id}`)
})

test('generate an account, receive an OTP email live, copy the code', async ({ page, request }) => {
  test.skip(!INGEST_SECRET, 'INGEST_SECRET is not available (env or ../.env)')
  const tag = `e2e-${Date.now()}`

  // Generate through the UI
  await page.goto('/accounts')
  await page.getByRole('button', { name: 'Generate Account' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox', { name: 'Provider' })).toContainText('Own domain')
  await dialog.getByLabel('Tag').fill(tag)
  await dialog.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(dialog).toBeHidden()

  const list = await request.get(`/api/accounts?search=${tag}`)
  const [account] = (await list.json()).data as { id: string; email: string }[]
  createdAccounts.push(account.id)
  expect(account.email).toMatch(/^[a-z]+[._]?[a-z]+\d{0,4}@/)

  // Open the inbox, then deliver mail: it must appear without reloading
  await page.goto(`/inbox?account=${account.id}`)
  await ingest(
    request,
    account.email,
    'Kode verifikasi E2E',
    '<p>Kode verifikasi kamu: <b>735 209</b></p><p><a href="https://example.com/verify?token=e2eTokenAbcdefgh123">Verify email</a></p>',
  )
  await expect(page.getByText(`New email for ${account.email}`)).toBeVisible({ timeout: 15_000 })
  await page.getByText('Kode verifikasi E2E').first().click()

  // OTP and verification link cards
  await expect(page.locator('[data-otp-code]')).toHaveText('735209')
  await expect(page.getByRole('link', { name: 'Open', exact: true })).toHaveAttribute(
    'href',
    'https://example.com/verify?token=e2eTokenAbcdefgh123',
  )
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByText('OTP copied to clipboard')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('735209')
})
