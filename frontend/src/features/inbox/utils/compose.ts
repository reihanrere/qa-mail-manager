/** Fields of the compose / reply form. */
export interface ComposeValues {
  to: string
  subject: string
  text: string
}

/** Splits "a@x.com, b@y.com" into addresses. */
export function parseRecipients(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

/** Prefills a reply: sender as recipient, "Re:" subject and the quoted text. */
export function replyDefaults(message: {
  subject: string
  text: string
  from: { address: string }
}): ComposeValues {
  const subject = /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`
  const quoted = message.text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return { to: message.from.address, subject, text: quoted ? `\n\n${quoted}` : '' }
}
