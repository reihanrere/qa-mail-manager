import type { MessageAttachment } from '@/types/message'

/**
 * Points `cid:` references in an HTML body (inline images) at the attachment download
 * URLs, so embedded logos and screenshots render. Unknown ids are left untouched.
 */
export function resolveCidImages(
  html: string,
  attachments: MessageAttachment[] | undefined,
  urlFor: (attachment: MessageAttachment) => string,
): string {
  const byContentId = new Map<string, MessageAttachment>()
  for (const attachment of attachments ?? []) {
    if (attachment.contentId) byContentId.set(attachment.contentId.toLowerCase(), attachment)
  }
  if (byContentId.size === 0) return html
  return html.replace(/cid:([^"'\s)>]+)/gi, (match, id: string) => {
    const attachment = byContentId.get(decodeURIComponent(id).toLowerCase())
    return attachment ? urlFor(attachment) : match
  })
}
