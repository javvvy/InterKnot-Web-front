/**
 * useDmStream —— DM 私聊 WebSocket 客户端（模块级单例，整个 SPA 共用一条连接）
 */

import { ref, computed, type ComputedRef } from "vue"
import { useApi } from "./useApi"
import type { DmWsEvent, DmWsEventType } from "@/types/entities"

const TOKEN_KEY = "access_token"
const WS_PATH = "/dm/socket"
const TICKET_PATH = "/api/dm/socket/ticket"

const APP_PING_MS = 20_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 32_000
const RECONNECT_MAX_ATTEMPTS = 6

type AnyHandler = (event: DmWsEvent<unknown>) => void

let ws: WebSocket | null = null
let started = false
let connectInFlight = false
let pingTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let manualStop = false

const listeners = new Map<string, Set<AnyHandler>>()

const connected = ref(false)

const buildWsUrl = (apiBaseUrl: string, ticket: string): string => {
  const trimmed = apiBaseUrl.replace(/\/+$/, "")
  let origin: string
  if (!trimmed) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    origin = `${proto}//${window.location.host}`
  } else if (trimmed.startsWith("https://")) {
    origin = `wss://${trimmed.slice("https://".length)}`
  } else if (trimmed.startsWith("http://")) {
    origin = `ws://${trimmed.slice("http://".length)}`
  } else {
    origin = trimmed
  }
  return `${origin}${WS_PATH}?ticket=${encodeURIComponent(ticket)}`
}

const emit = (event: DmWsEvent<unknown>) => {
  const exact = listeners.get(event.type)
  if (exact) {
    for (const h of exact) {
      try { h(event) } catch { /* noop */ }
    }
  }
  const wildcard = listeners.get("*")
  if (wildcard) {
    for (const h of wildcard) {
      try { h(event) } catch { /* noop */ }
    }
  }
}

const clearTimers = () => {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

const teardownSocket = () => {
  if (!ws) return
  try {
    ws.onopen = null
    ws.onerror = null
    ws.onclose = null
    ws.onmessage = null
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  } catch { /* noop */ }
  ws = null
}

const scheduleReconnect = () => {
  if (manualStop) return
  if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
    started = false
    return
  }
  reconnectAttempts += 1
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** (reconnectAttempts - 1), RECONNECT_MAX_MS)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void doConnect()
  }, delay)
}

const doConnect = async (): Promise<void> => {
  if (typeof window === "undefined") return
  if (connectInFlight) return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  connectInFlight = true

  try {
    const token = localStorage.getItem(TOKEN_KEY) || ""
    if (!token) {
      started = false
      reconnectAttempts = 0
      return
    }

    const api = useApi()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ""

    const resp = await api.getWsTicket()
    const ticket = resp?.ticket
    if (!ticket) {
      scheduleReconnect()
      return
    }

    const url = buildWsUrl(apiBaseUrl, ticket)
    teardownSocket()

    const socket = new WebSocket(url)
    ws = socket

    socket.onopen = () => {
      reconnectAttempts = 0
      connected.value = true
      if (pingTimer) clearInterval(pingTimer)
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try { socket.send(JSON.stringify({ type: "ping" })) } catch { /* noop */ }
        }
      }, APP_PING_MS)
    }

    socket.onmessage = (ev) => {
      try {
        const event = JSON.parse(String(ev.data)) as DmWsEvent<unknown>
        if (!event || typeof event.type !== "string") return
        emit(event)
      } catch { /* malformed */ }
    }

    socket.onerror = (ev) => {
      console.warn("[dm-ws] socket error", ev)
    }

    socket.onclose = (ev) => {
      connected.value = false
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
      if (ws === socket) ws = null
      if (ev.code !== 1000 && ev.code !== 1001) {
        console.warn(`[dm-ws] socket closed code=${ev.code} reason=${ev.reason || "<none>"}`)
      }
      if (!manualStop) scheduleReconnect()
    }
  } catch (err) {
    console.warn("[dm-ws] doConnect failed", err)
    connected.value = false
    scheduleReconnect()
  } finally {
    connectInFlight = false
  }
}

export function useDmStream() {
  const start = () => {
    if (typeof window === "undefined") return
    if (started) return
    started = true
    manualStop = false
    reconnectAttempts = 0
    void doConnect()
  }

  const stop = () => {
    manualStop = true
    started = false
    reconnectAttempts = 0
    clearTimers()
    teardownSocket()
    connected.value = false
  }

  const on = <T = unknown>(
    type: DmWsEventType | "*",
    handler: (event: DmWsEvent<T>) => void,
  ): (() => void) => {
    let set = listeners.get(type)
    if (!set) {
      set = new Set()
      listeners.set(type, set)
    }
    set.add(handler as AnyHandler)
    return () => {
      const s = listeners.get(type)
      if (!s) return
      s.delete(handler as AnyHandler)
      if (s.size === 0) listeners.delete(type)
    }
  }

  const sendTyping = (conversationId: string, userNo?: string | null) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!conversationId) return
    try {
      ws.send(JSON.stringify({ type: "typing", conversationId, userNo: userNo ?? null }))
    } catch { /* noop */ }
  }

  return {
    isConnected: computed(() => connected.value) as ComputedRef<boolean>,
    start,
    stop,
    on,
    sendTyping,
  }
}
