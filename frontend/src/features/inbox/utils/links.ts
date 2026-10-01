/** A link in an email that probably completes a signup, login or password reset. */
export interface VerificationLink {
  url: string
  /** Anchor text, or the URL's host and path for bare links */
  label: string
}

// Words that mark the action link; checked in both the anchor text and the URL
const ACTION =
  /(verif|confirm|konfirmasi|activat|aktivasi|validat|magic|sign[\s_-]?in|log[\s_-]?in|masuk|reset|password|kata[\s_-]?sandi|token|invite|undangan|approve|setujui)/i
// Links that are never the action, even if they contain a keyword
const NOISE =
  /(unsubscribe|berhenti|privacy|privasi|terms|ketentuan|help|bantuan|support|preferences|mailto:|tel:)/i

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/gi

function score(url: string, label: string): number {
  if (NOISE.test(url) || NOISE.test(label)) return 0
  let points = 0
  if (ACTION.test(label)) points += 2
  if (ACTION.test(url)) points += 1
  // Long opaque tokens in the query are typical for one-time links
  if (/[?&][^=]+=[A-Za-z0-9_-]{16,}/.test(url)) points += 1
  return points
}

function shortLabel(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`
  } catch {
    return url
  }
}

function anchorsFromHtml(html: string): VerificationLink[] {
  const links: VerificationLink[] = []
  const anchor = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(anchor)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? '').replace(/&amp;/g, '&').trim()
    const label = match[4]
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (/^https?:\/\//i.test(url)) links.push({ url, label: label || shortLabel(url) })
  }
  return links
}

/**
 * Returns the most likely verification / login / reset links, best first (at most `limit`).
 * Anchor text weighs more than the URL, and unsubscribe/help links are ignored.
 */
export function extractVerificationLinks(
  message: { text?: string; html?: string[] },
  limit = 2,
): VerificationLink[] {
  const candidates = [
    ...(message.html ?? []).flatMap(anchorsFromHtml),
    ...[...(message.text ?? '').matchAll(URL_IN_TEXT)].map(([url]) => ({
      url: url.replace(/[.,;:!?]+$/, ''),
      label: shortLabel(url),
    })),
  ]

  const best = new Map<string, { link: VerificationLink; points: number }>()
  for (const link of candidates) {
    const points = score(link.url, link.label)
    if (points < 2) continue
    const existing = best.get(link.url)
    if (!existing || points > existing.points) best.set(link.url, { link, points })
  }
  return [...best.values()]
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map(({ link }) => link)
}
