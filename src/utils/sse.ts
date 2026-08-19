/**
 * 浏览器侧 SSE 解析（基于 fetch + ReadableStream）
 *
 * 为什么不用 EventSource：
 *  - EventSource 不能加自定义 header（如 token）
 *  - EventSource 只支持 GET
 *  - 我们的 SSE 接口（如 KKCall chat）是 POST + 需要 token header
 */

export interface SseEvent<TData = unknown> {
  type: string
  data: TData
}

export interface FetchSSEOptions {
  method?: "GET" | "POST"
  body?: unknown
  token?: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

export async function* fetchSSE<TData = unknown>(
  url: string,
  options: FetchSSEOptions = {},
): AsyncGenerator<SseEvent<TData>, void, void> {
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    ...(options.headers || {}),
  }
  if (options.token) headers.token = options.token

  let body: BodyInit | undefined
  if (options.body != null) {
    if (typeof options.body === "string") {
      body = options.body
    } else {
      headers["Content-Type"] = headers["Content-Type"] || "application/json"
      body = JSON.stringify(options.body)
    }
  }

  const resp = await fetch(url, {
    method: options.method || "GET",
    headers,
    body,
    signal: options.signal,
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    const err: Error & { status?: number; body?: string } = new Error(
      `SSE HTTP ${resp.status}: ${text.slice(0, 200) || resp.statusText}`,
    )
    err.status = resp.status
    err.body = text
    throw err
  }
  if (!resp.body) {
    throw new Error("SSE response has no body")
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sepIdx: number
      while ((sepIdx = findFrameEnd(buffer)) >= 0) {
        const frame = buffer.slice(0, sepIdx)
        buffer = buffer.slice(sepIdx).replace(/^(\r?\n){2}/, "")
        const parsed = parseFrame<TData>(frame)
        if (parsed) yield parsed
      }
    }
    if (buffer.trim()) {
      const parsed = parseFrame<TData>(buffer)
      if (parsed) yield parsed
    }
  } finally {
    try { reader.releaseLock() } catch { /* noop */ }
  }
}

function findFrameEnd(buf: string): number {
  const a = buf.indexOf("\n\n")
  const b = buf.indexOf("\r\n\r\n")
  if (a < 0 && b < 0) return -1
  if (a < 0) return b
  if (b < 0) return a
  return Math.min(a, b)
}

function parseFrame<TData>(frame: string): SseEvent<TData> | null {
  let type = "message"
  const dataLines: string[] = []
  for (const rawLine of frame.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(":")) continue
    if (line.startsWith("event:")) {
      type = line.slice(6).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) return null
  const dataStr = dataLines.join("\n")
  let data: any
  try { data = JSON.parse(dataStr) } catch { data = dataStr }
  return { type, data: data as TData }
}
