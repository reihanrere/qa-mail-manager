import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { Outcome, PENDING_PREFIX, deliver, enqueue, retryPending } from './index.js'

/** In-memory stand-in for a KV namespace (put/get/list/delete with metadata). */
function fakeKV() {
  const store = new Map()
  return {
    store,
    async put(key, value, options = {}) {
      store.set(key, { value, metadata: options.metadata, ttl: options.expirationTtl })
    },
    async get(key) {
      return store.get(key)?.value ?? null
    },
    async delete(key) {
      store.delete(key)
    },
    async list({ prefix, limit }) {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .slice(0, limit)
        .map((name) => ({ name, metadata: store.get(name).metadata }))
      return { keys }
    },
  }
}

function fakeMessage(to = 'rinda@re-testing.me') {
  return {
    to,
    from: 'shop@example.com',
    raw: new Response('Subject: hi\r\n\r\nbody').body,
    setReject: vi.fn(),
    forward: vi.fn(),
  }
}

const baseEnv = () => ({ INGEST_URL: 'https://ingest.test/api/ingest', INGEST_SECRET: 's'.repeat(64) })

function mockFetch(...statuses) {
  const fn = vi.fn()
  for (const status of statuses) {
    if (status === 'network') fn.mockRejectedValueOnce(new TypeError('fetch failed'))
    else fn.mockResolvedValueOnce(new Response('{}', { status }))
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}))
afterEach(() => vi.unstubAllGlobals())

describe('deliver', () => {
  it.each([
    [201, Outcome.STORED],
    [200, Outcome.STORED],
    [404, Outcome.UNKNOWN_RECIPIENT],
    [401, Outcome.REJECTED],
    [422, Outcome.REJECTED],
    [502, Outcome.UNAVAILABLE],
    ['network', Outcome.UNAVAILABLE],
  ])('HTTP %s -> %s', async (status, outcome) => {
    mockFetch(status)
    expect((await deliver(baseEnv(), new ArrayBuffer(1), 'a@b', 'c@d')).outcome).toBe(outcome)
  })

  it('sends the secret and envelope headers', async () => {
    const fetchMock = mockFetch(201)
    await deliver(baseEnv(), new ArrayBuffer(1), 'to@re-testing.me', 'from@x')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ingest.test/api/ingest')
    expect(init.headers['X-Ingest-Secret']).toBe('s'.repeat(64))
    expect(init.headers['X-Envelope-To']).toBe('to@re-testing.me')
  })
})

describe('email handler', () => {
  it('stores and optionally forwards', async () => {
    mockFetch(201)
    const message = fakeMessage()
    await worker.email(message, { ...baseEnv(), FORWARD_TO: 'me@gmail.com' })
    expect(message.setReject).not.toHaveBeenCalled()
    expect(message.forward).toHaveBeenCalledWith('me@gmail.com')
  })

  it('rejects unknown recipients', async () => {
    mockFetch(404)
    const message = fakeMessage()
    await worker.email(message, baseEnv())
    expect(message.setReject).toHaveBeenCalledWith('Unknown recipient')
  })

  it('queues the message when the backend is down', async () => {
    mockFetch('network')
    const env = { ...baseEnv(), PENDING: fakeKV(), PENDING_TTL_SECONDS: '3600' }
    const message = fakeMessage()
    await worker.email(message, env)
    expect(message.setReject).not.toHaveBeenCalled()
    const [entry] = env.PENDING.store.values()
    expect(entry.metadata.to).toBe('rinda@re-testing.me')
    expect(entry.ttl).toBe(3600)
  })

  it('throws (temporary failure) when the backend is down and no queue is bound', async () => {
    mockFetch(503)
    await expect(worker.email(fakeMessage(), baseEnv())).rejects.toThrow('Ingest unavailable')
  })

  it('throws when not configured', async () => {
    await expect(worker.email(fakeMessage(), {})).rejects.toThrow('must be configured')
  })
})

describe('retryPending', () => {
  async function queued(count) {
    const env = { ...baseEnv(), PENDING: fakeKV() }
    for (let i = 0; i < count; i++) {
      await enqueue(env, new TextEncoder().encode(`m${i}`).buffer, `u${i}@re-testing.me`, 'x', 1000 + i)
    }
    return env
  }

  it('delivers oldest first and drops permanently rejected messages', async () => {
    const env = await queued(3)
    const fetchMock = mockFetch(201, 404, 201)
    expect(await retryPending(env)).toEqual({ delivered: 2, dropped: 1, remaining: 0 })
    expect(fetchMock.mock.calls.map(([, init]) => init.headers['X-Envelope-To'])).toEqual([
      'u0@re-testing.me',
      'u1@re-testing.me',
      'u2@re-testing.me',
    ])
    expect(env.PENDING.store.size).toBe(0)
  })

  it('stops at the first failure and keeps the rest', async () => {
    const env = await queued(3)
    mockFetch(201, 502)
    expect(await retryPending(env)).toEqual({ delivered: 1, dropped: 0, remaining: 2 })
    expect([...env.PENDING.store.keys()].every((k) => k.startsWith(PENDING_PREFIX))).toBe(true)
    expect(env.PENDING.store.size).toBe(2)
  })

  it('respects RETRY_BATCH_SIZE', async () => {
    const env = await queued(5)
    env.RETRY_BATCH_SIZE = '2'
    mockFetch(201, 201)
    expect((await retryPending(env)).delivered).toBe(2)
    expect(env.PENDING.store.size).toBe(3)
  })
})
