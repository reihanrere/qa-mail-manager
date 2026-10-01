import { describe, expect, it } from 'vitest'
import { extractVerificationLinks } from './links'

describe('extractVerificationLinks', () => {
  it('prefers the action button over help and unsubscribe links', () => {
    const html = [
      '<a href="https://example.com/help">Pusat Bantuan</a>',
      '<a class="btn" href="https://example.com/verify?token=abc123def456ghi789">Verifikasi Sekarang</a>',
      '<a href="https://example.com/unsubscribe?u=1">Berhenti berlangganan</a>',
    ].join('')
    expect(extractVerificationLinks({ html: [html] })).toEqual([
      { url: 'https://example.com/verify?token=abc123def456ghi789', label: 'Verifikasi Sekarang' },
    ])
  })

  it('decodes &amp; in hrefs and strips markup from labels', () => {
    const html = "<a href='https://x.test/confirm?a=1&amp;b=2'><span>Confirm</span> <b>email</b></a>"
    expect(extractVerificationLinks({ html: [html] })[0]).toEqual({
      url: 'https://x.test/confirm?a=1&b=2',
      label: 'Confirm email',
    })
  })

  it('finds bare links in plain text', () => {
    const text = 'Reset your password: https://acme.test/reset-password?t=Zx81kLm2Qa93Rt7Y. Thanks!'
    expect(extractVerificationLinks({ text })).toEqual([
      { url: 'https://acme.test/reset-password?t=Zx81kLm2Qa93Rt7Y', label: 'acme.test/reset-password' },
    ])
  })

  it('returns nothing for newsletters', () => {
    const html =
      '<a href="https://shop.test/sale">Belanja sekarang</a><a href="https://shop.test/unsubscribe">x</a>'
    expect(extractVerificationLinks({ html: [html], text: 'Visit https://shop.test/sale' })).toEqual([])
  })
})
