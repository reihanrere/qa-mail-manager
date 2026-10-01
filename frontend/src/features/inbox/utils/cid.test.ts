import { describe, expect, it } from 'vitest'
import { resolveCidImages } from './cid'
import type { MessageAttachment } from '@/types/message'

const logo: MessageAttachment = {
  id: '1',
  filename: 'logo.png',
  contentType: 'image/png',
  size: 70,
  contentId: 'Logo@x',
}
const url = (a: MessageAttachment) => `https://api.test/a/${a.id}`

describe('resolveCidImages', () => {
  it('replaces known content ids, case-insensitively', () => {
    expect(resolveCidImages('<img src="cid:logo@X"> <img src=cid:logo@x>', [logo], url)).toBe(
      '<img src="https://api.test/a/1"> <img src=https://api.test/a/1>',
    )
  })

  it('leaves unknown ids and html without attachments alone', () => {
    expect(resolveCidImages('<img src="cid:other">', [logo], url)).toBe('<img src="cid:other">')
    expect(resolveCidImages('<img src="cid:logo@x">', [], url)).toBe('<img src="cid:logo@x">')
  })
})
