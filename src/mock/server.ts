import { findHandler } from './handlers'

let installed = false

export function setupMockServer() {
  if (installed) return
  installed = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url, window.location.origin)
    const pathname = url.pathname

    const handler = findHandler(pathname, request.method)
    if (handler) {
      try {
        const result = await handler({ url, request })
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ code: 0, msg: 'Mock handler error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return originalFetch(input, init)
  }
}
