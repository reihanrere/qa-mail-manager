import { describe, expect, it } from 'vitest'
import { extractOTP, extractOTPFromMessage, htmlToText } from './otp'

const lorem =
  "Lorem Ipsum has been the industry's standard dummy text ever since 1966, when designers at Letraset took a 1914 Cicero translation"

describe('extractOTPFromMessage', () => {
  it.each([
    [
      'English, code after keyword',
      { subject: 'Verify your email', text: 'Your verification code is 482913. It expires in 10 minutes.' },
      '482913',
    ],
    ['English, code before keyword', { subject: 'Hi', text: '482913 is your one-time passcode' }, '482913'],
    ['Indonesian', { subject: 'Kode OTP', text: 'Kode verifikasi Anda: 5521' }, '5521'],
    ['split with a space', { subject: 'x', text: 'Your login code: 123 456' }, '123456'],
    ['split with a dash', { subject: 'x', text: 'Security code 123-456' }, '123456'],
    ['alphanumeric token', { subject: 'x', text: 'Use token A7K9Q2 to continue' }, 'A7K9Q2'],
    ['only in subject', { subject: '123456 is your Instagram code', text: '' }, '123456'],
    [
      'HTML with the code in its own table cell',
      {
        subject: 'Welcome',
        text: '',
        html: [
          '<style>.a{width:1200px}</style><table><tr><td>Your code</td></tr><tr><td><b>908172</b></td></tr></table>',
        ],
      },
      '908172',
    ],
  ])('finds the code: %s', (_, message, expected) => {
    expect(extractOTPFromMessage(message)?.code).toBe(expected)
  })

  it.each([
    ['years in prose', { subject: 'Testing Email Message', text: lorem, html: [`<p>${lorem}</p>`] }],
    ['plain short text', { subject: 'test', text: 'test', html: [] }],
    ['prices and years', { subject: 'Invoice', text: 'Total 2500 due by 2026. Thanks' }],
    ['number in a different sentence', { subject: 'x', text: 'Enter the code below. Order 88231 shipped.' }],
    ['empty message', {}],
  ])('ignores numbers without an OTP keyword nearby: %s', (_, message) => {
    expect(extractOTPFromMessage(message)).toBeNull()
  })

  it('reports the code length without separators', () => {
    expect(extractOTP('PIN: 12 34')).toBeNull()
    expect(extractOTP('Your OTP is 123 456')).toEqual({ code: '123456', length: 6 })
  })

  it('prefers the subject over the body', () => {
    const result = extractOTPFromMessage({ subject: 'Code 111111', text: 'Your code is 222222' })
    expect(result?.code).toBe('111111')
  })
})

describe('htmlToText', () => {
  it('drops style/script contents and entities', () => {
    const text = htmlToText(
      '<head><title>x</title></head><style>p{color:red}</style><p>A&nbsp;&amp;&nbsp;B</p><script>var otp=999999</script>',
    )
    expect(text).not.toContain('color')
    expect(text).not.toContain('999999')
    expect(text).toContain('A & B')
  })

  it('turns block boundaries into line breaks', () => {
    expect(htmlToText('<div>one</div><div>two</div>')).toMatch(/one\s*\n\s*two/)
  })
})
