import { ApiClientError } from '@/types/api'

export function normalizeApiError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error
  if (error instanceof Error) {
    const apiErr = new ApiClientError(error.message)
    apiErr.stack = error.stack
    return apiErr
  }
  return new ApiClientError('未知请求异常')
}

export function resolveErrorMessage(error: unknown, fallback = '请求失败'): string {
  const apiErr = normalizeApiError(error)

  if (apiErr.code === 'REGISTER_CODE_COOLDOWN') return '验证码发送过于频繁，请稍后再试'
  if (apiErr.code === 'REGISTER_CODE_INVALID') return '验证码错误或已过期'

  if (!apiErr.statusCode) {
    const msg = apiErr.message || ''
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
      return '网络异常，请检查网络连接'
    }
  }

  if (apiErr.code && apiErr.message) return apiErr.message
  if (apiErr.statusCode && apiErr.statusCode >= 500) return '服务器异常，请稍后重试'
  return apiErr.message || fallback
}
