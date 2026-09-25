import type { OTPResult } from '@/types/message'

// The API has no OTP field, so a code is only accepted when it sits next to a
// keyword that signals it. Bare numbers (years, prices, phone fragments) are ignored.
const KEYWORD =
  '(?:otp|one[\\s-]?time|pass\\s?code|verification|verify|verifikasi|confirmation|konfirmasi|security|authentication|auth|login|log\\s?in|sign[\\s-]?in|pin|kode|code|token)'

// 4-8 alphanumerics containing at least one digit, or a split "123 456" / "123-456"
const CODE = '((?=[a-z0-9]*\\d)[a-z0-9]{4,8}|\\d{3}[\\s-]\\d{3})'

// Gap between keyword and code: same sentence (may span table cells), no digits, at most 60 chars
const GAP = '[^\\d.]{0,60}?'

const KEYWORD_THEN_CODE = new RegExp(`\\b${KEYWORD}\\b${GAP}\\b${CODE}\\b`, 'i')
const CODE_THEN_KEYWORD = new RegExp(`\\b${CODE}\\b${GAP}\\b${KEYWORD}\\b`, 'i')

function toResult(raw: string): OTPResult {
  const code = raw.replace(/[\s-]/g, '').toUpperCase()
  return { code, length: code.length }
}

/** Finds a verification code in plain text, or null when no code sits next to an OTP keyword. */
export function extractOTP(text: string): OTPResult | null {
  if (!text) return null
  const match = text.match(KEYWORD_THEN_CODE) ?? text.match(CODE_THEN_KEYWORD)
  return match ? toResult(match[1]) : null
}

/** Crude HTML-to-text conversion for OTP scanning: drops style/script/head, keeps block breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
}

/** Looks for a verification code in the subject, then the text body, then each HTML part. */
export function extractOTPFromMessage(detail: {
  subject?: string
  text?: string
  html?: string[]
}): OTPResult | null {
  const sources = [detail.subject ?? '', detail.text ?? '', ...(detail.html ?? []).map(htmlToText)]
  for (const source of sources) {
    const result = extractOTP(source)
    if (result) return result
  }
  return null
}
