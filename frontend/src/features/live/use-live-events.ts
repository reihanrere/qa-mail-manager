import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { apiUrl, API_URL } from '@/lib/api-url'
import { useAppStore } from '@/store/app.store'
import { useLiveStore } from '@/store/live.store'
import {
  invalidateForEvent,
  LIVE_EVENT_TYPES,
  parseLiveEvent,
  summarizeNewMail,
  type LiveEvent,
} from './events'

// New-mail events arriving within this window share one toast
const TOAST_BATCH_MS = 1500

/**
 * Subscribes to the backend's server-sent events so new mail shows up at once instead of
 * on the next poll. EventSource reconnects by itself after network errors.
 */
export function useLiveEvents() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const setStatus = useLiveStore((state) => state.setStatus)
  // Read when a toast is due, so toggling the preference does not reconnect the stream
  const toastsEnabled = useRef(useAppStore.getState().newMailToasts)
  useEffect(
    () =>
      useAppStore.subscribe((state) => {
        toastsEnabled.current = state.newMailToasts
      }),
    [],
  )

  useEffect(() => {
    if (!API_URL || typeof EventSource === 'undefined') {
      setStatus('disconnected')
      return
    }
    const source = new EventSource(apiUrl('/events'))
    setStatus('connecting')
    source.onopen = () => setStatus('connected')
    source.onerror = () => setStatus(source.readyState === EventSource.CLOSED ? 'disconnected' : 'connecting')

    let pending: LiveEvent[] = []
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      const { title, description, accountId } = summarizeNewMail(pending)
      pending = []
      toast.info(title, {
        id: 'new-mail',
        description,
        action: {
          label: 'Open',
          onClick: () => navigate({ to: '/inbox', search: accountId ? { account: accountId } : {} }),
        },
      })
    }

    const handle = (message: MessageEvent<string>) => {
      const event = parseLiveEvent(message.data)
      if (!event) return
      invalidateForEvent(queryClient, event)
      if (event.type === 'message.created' && toastsEnabled.current) {
        pending.push(event)
        clearTimeout(flushTimer)
        flushTimer = setTimeout(flush, TOAST_BATCH_MS)
      }
    }
    for (const type of LIVE_EVENT_TYPES) source.addEventListener(type, handle)

    return () => {
      clearTimeout(flushTimer)
      for (const type of LIVE_EVENT_TYPES) source.removeEventListener(type, handle)
      source.close()
    }
  }, [queryClient, navigate, setStatus])
}
