/**
 * Absolute backend API base URL. `VITE_API_URL` may be relative ("/api" behind the Docker
 * nginx proxy), so it is resolved against the page origin. Empty when not configured.
 */
export const API_URL: string = import.meta.env.VITE_API_URL
  ? new URL(import.meta.env.VITE_API_URL, globalThis.location?.origin ?? 'http://localhost')
      .toString()
      .replace(/\/$/, '')
  : ''

/** Absolute URL of an API path such as `/events`, for links and EventSource (not axios). */
export function apiUrl(path: string, params?: Record<string, string | boolean | undefined>): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== false) url.searchParams.set(key, String(value))
  }
  return url.toString()
}
