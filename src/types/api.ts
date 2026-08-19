export interface ApiErrorInfo {
  code?: string
  message?: string
  details?: Record<string, unknown>
}

export interface ApiEnvelope<T> {
  data?: T
  error?: ApiErrorInfo
}

export interface Pagination<T> {
  nodes: T[]
  endCursor: string
  hasNextPage: boolean
}

export class ApiClientError extends Error {
  statusCode?: number
  code?: string
  details?: Record<string, unknown>

  constructor(message: string, statusCode?: number, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiClientError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}
