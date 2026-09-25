import { isAxiosError } from 'axios'

/** Prefers the backend's `{ message }` envelope over axios' generic status text. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? error.message ?? fallback
  }
  return fallback
}
