import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { apiUrl, API_URL } from '@/lib/api-url'
import { useLiveStore } from '@/store/live.store'
import { invalidateForEvent, LIVE_EVENT_TYPES, parseLiveEvent } from './events'

/**
 * Subscribes to the backend's server-sent events so new mail shows up at once instead of
 * on the next poll. EventSource reconnects by itself after network errors.
 */
export function useLiveEvents() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const setStatus = useLiveStore((state) => state.setStatus)

  useEffect(() => {
    if (!API_URL || typeof EventSource === 'undefined') {
      setStatus('disconnected')
      return
    }
    const source = new EventSource(apiUrl('/events'))
    setStatus('connecting')
    source.onopen = () => setStatus('connected')
    source.onerror = () => setStatus(source.readyState === EventSource.CLOSED ? 'disconnected' : 'connecting')

    const handle = (message: MessageEvent<string>) => {
      const event = parseLiveEvent(message.data)
      if (!event) return
      invalidateForEvent(queryClient, event)
      if (event.type === 'message.created' && event.accountId) {
        const accountId = event.accountId
        toast.info(`New email for ${event.accountEmail ?? 'an account'}`, {
          description: event.subject || '(No subject)',
          action: {
            label: 'Open',
            onClick: () => navigate({ to: '/inbox', search: { account: accountId } }),
          },
        })
      }
    }
    for (const type of LIVE_EVENT_TYPES) source.addEventListener(type, handle)

    return () => {
      for (const type of LIVE_EVENT_TYPES) source.removeEventListener(type, handle)
      source.close()
    }
  }, [queryClient, navigate, setStatus])
}
