import { describe, expect, it } from 'vitest'
import { parseRecipients, replyDefaults } from './compose'

describe('parseRecipients', () => {
  it('splits on commas, semicolons and spaces', () => {
    expect(parseRecipients(' a@x.test, b@y.test;c@z.test  ')).toEqual(['a@x.test', 'b@y.test', 'c@z.test'])
  })
})

describe('replyDefaults', () => {
  it('quotes the text and prefixes the subject once', () => {
    expect(
      replyDefaults({ subject: 'Kode OTP', text: 'Line 1\nLine 2', from: { address: 'shop@x.test' } }),
    ).toEqual({
      to: 'shop@x.test',
      subject: 'Re: Kode OTP',
      text: '\n\n> Line 1\n> Line 2',
    })
    expect(replyDefaults({ subject: 'RE: hi', text: '', from: { address: 'a@b.test' } }).subject).toBe(
      'RE: hi',
    )
  })
})
