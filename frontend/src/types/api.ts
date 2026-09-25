/** Envelope every backend endpoint responds with. */
export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

/** Pagination info returned alongside list endpoints. */
export interface PageMeta {
  page: number
  limit: number
  total: number
  hasMore: boolean
  /** Inbox search only: the scan stopped before reaching the oldest message */
  truncated?: boolean
}

/** Envelope for paginated list endpoints. */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PageMeta
}

/** One page of items as consumed by infinite queries. */
export interface Page<T> {
  items: T[]
  meta: PageMeta
}
