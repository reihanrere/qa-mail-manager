import { describe, expect, it } from 'vitest'
import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { flattenMessages, messageKeys, removeMessageFromCache, setMessageSeenInCache } from './queries'
import { getNextPage } from '@/features/account/queries'
import type { Page } from '@/types/api'
import type { Message } from '@/types/message'

function message(id: string, createdAt: string, seen = false): Message {
  return { id, subject: id, intro: '', seen, createdAt, from: { name: 'S', address: 's@example.com' } }
}

function pages(...items: Message[][]): InfiniteData<Page<Message>> {
  return {
    pageParams: items.map((_, i) => i + 1),
    pages: items.map((pageItems, i) => ({
      items: pageItems,
      meta: { page: i + 1, limit: 30, total: 99, hasMore: i < items.length - 1 },
    })),
  }
}

describe('flattenMessages', () => {
  it('returns newest first across pages', () => {
    const data = pages(
      [message('b', '2026-09-22T10:00:00Z'), message('c', '2026-09-21T10:00:00Z')],
      [message('a', '2026-09-23T10:00:00Z')],
    )
    expect(flattenMessages(data).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops duplicates when new mail shifts page boundaries', () => {
    const data = pages(
      [message('new', '2026-09-23T10:00:00Z'), message('x', '2026-09-22T10:00:00Z')],
      [message('x', '2026-09-22T10:00:00Z'), message('y', '2026-09-21T10:00:00Z')],
    )
    expect(flattenMessages(data).map((m) => m.id)).toEqual(['new', 'x', 'y'])
  })

  it('handles missing data', () => {
    expect(flattenMessages(undefined)).toEqual([])
  })
})

describe('message cache helpers', () => {
  const accountId = 'acc-1'

  function seeded() {
    const client = new QueryClient()
    client.setQueryData(
      messageKeys.list(accountId, ''),
      pages([message('m1', '2026-09-22T10:00:00Z'), message('m2', '2026-09-21T10:00:00Z')]),
    )
    client.setQueryData(messageKeys.list(accountId, 'otp'), pages([message('m1', '2026-09-22T10:00:00Z')]))
    client.setQueryData(messageKeys.list('other', ''), pages([message('m1', '2026-09-22T10:00:00Z')]))
    client.setQueryData(messageKeys.detail(accountId, 'm1'), { id: 'm1' })
    return client
  }

  const itemsOf = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryData<InfiniteData<Page<Message>>>(key)!.pages.flatMap((p) => p.items)

  it('marks a message as seen in every cached list of that account only', () => {
    const client = seeded()
    setMessageSeenInCache(client, accountId, 'm1', true)

    expect(itemsOf(client, messageKeys.list(accountId, '')).find((m) => m.id === 'm1')?.seen).toBe(true)
    expect(itemsOf(client, messageKeys.list(accountId, 'otp'))[0].seen).toBe(true)
    expect(itemsOf(client, messageKeys.list('other', ''))[0].seen).toBe(false)
  })

  it('removes a deleted message, adjusts totals and drops its detail', () => {
    const client = seeded()
    removeMessageFromCache(client, accountId, 'm1')

    expect(itemsOf(client, messageKeys.list(accountId, '')).map((m) => m.id)).toEqual(['m2'])
    expect(
      client.getQueryData<InfiniteData<Page<Message>>>(messageKeys.list(accountId, ''))!.pages[0].meta.total,
    ).toBe(98)
    expect(client.getQueryData(messageKeys.detail(accountId, 'm1'))).toBeUndefined()
    expect(itemsOf(client, messageKeys.list('other', ''))).toHaveLength(1)
  })
})

describe('getNextPage', () => {
  it('advances only while the server reports more', () => {
    expect(getNextPage({ items: [], meta: { page: 2, limit: 25, total: 60, hasMore: true } })).toBe(3)
    expect(
      getNextPage({ items: [], meta: { page: 3, limit: 25, total: 60, hasMore: false } }),
    ).toBeUndefined()
  })
})
