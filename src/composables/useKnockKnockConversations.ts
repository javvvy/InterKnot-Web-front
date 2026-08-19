/**
 * useKnockKnockConversations —— 敲敲会话视图（懒加载 + SSE）
 */

import { ref, computed, type ComputedRef, type Ref } from "vue"
import { useApi } from "./useApi"
import { fetchSSE } from "@/utils/sse"
import type { KnockConversation, KnockSseEvent, NotificationDto } from "@/types/entities"

interface ConversationListResponse {
  data: KnockConversation[]
  meta?: { total?: number; truncated?: boolean; scannedRows?: number; cap?: number }
}

interface MessagesResponse {
  data: NotificationDto[]
  meta?: { nextCursor?: string | null; hasMore?: boolean }
}

interface ConversationMessageState {
  items: NotificationDto[]
  loading: boolean
  hasMore: boolean
  nextCursor: string | null
  hydrated: boolean
}

const TOKEN_KEY = "access_token"

const emptyMessageState = (): ConversationMessageState => ({
  items: [],
  loading: false,
  hasMore: false,
  nextCursor: null,
  hydrated: false,
})

interface UseKnockKnockConversations {
  conversations: ComputedRef<KnockConversation[]>
  isLoading: ComputedRef<boolean>
  error: ComputedRef<string | null>
  truncated: ComputedRef<boolean>
  refresh: () => Promise<void>
  messageStateOf: (id: string) => ComputedRef<ConversationMessageState>
  ensureMessages: (id: string, force?: boolean) => Promise<void>
  loadMoreMessages: (id: string) => Promise<void>
  markConversationAsRead: (id: string) => Promise<void>
  activeConversationId: Ref<string | null>
  startStream: () => void
  stopStream: () => void
  reset: () => void
}

// ── 模块级单例 ──
let sseAbortController: AbortController | null = null
let sseStarted = false
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null
const REFRESH_DEBOUNCE_MS = 250
const MAX_CONSECUTIVE_SSE_FAILURES = 3
let sseFailureStreak = 0

export function useKnockKnockConversations(): UseKnockKnockConversations {
  const conversations = ref<KnockConversation[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const truncated = ref(false)
  const messagesById = ref<Record<string, ConversationMessageState>>({})
  const activeConversationId = ref<string | null>(null)

  const api = useApi()

  async function refresh(): Promise<void> {
    if (isLoading.value) return
    isLoading.value = true
    error.value = null
    try {
      const list = await api.getKnockConversations()
      conversations.value = list ?? []
      truncated.value = false
    } catch (err: any) {
      error.value = err?.message || "加载失败"
      conversations.value = []
      truncated.value = false
    } finally {
      isLoading.value = false
    }
  }

  function ensureMessageBucket(id: string): ConversationMessageState {
    let bucket = messagesById.value[id]
    if (!bucket) {
      bucket = emptyMessageState()
      messagesById.value = { ...messagesById.value, [id]: bucket }
    }
    return bucket
  }

  function patchMessageState(id: string, patch: Partial<ConversationMessageState>) {
    const prev = messagesById.value[id] ?? emptyMessageState()
    messagesById.value = {
      ...messagesById.value,
      [id]: { ...prev, ...patch },
    }
  }

  async function fetchMessagesPage(id: string, cursor: string | null): Promise<MessagesResponse> {
    return api.getKnockMessages(id, cursor)
  }

  async function ensureMessages(id: string, force = false): Promise<void> {
    const bucket = ensureMessageBucket(id)
    if (bucket.hydrated && !force) return
    if (bucket.loading) return

    patchMessageState(id, { loading: true })
    try {
      const resp = await fetchMessagesPage(id, null)
      const incoming = resp?.data ?? []
      const nextItems = bucket.hydrated && force
        ? mergeMessages(bucket.items, incoming)
        : incoming

      patchMessageState(id, {
        items: nextItems,
        hasMore: bucket.hydrated && force
          ? bucket.hasMore || !!resp?.meta?.hasMore
          : !!resp?.meta?.hasMore,
        nextCursor: bucket.hydrated && force
          ? bucket.nextCursor ?? resp?.meta?.nextCursor ?? null
          : resp?.meta?.nextCursor ?? null,
        hydrated: true,
        loading: false,
      })
    } catch (err) {
      patchMessageState(id, { loading: false })
      throw err
    }
  }

  function mergeMessages(existing: NotificationDto[], incoming: NotificationDto[]): NotificationDto[] {
    if (incoming.length === 0) return existing
    const map = new Map<string, NotificationDto>()
    for (const it of existing) {
      if (it?.documentId) map.set(it.documentId, it)
    }
    for (const it of incoming) {
      if (it?.documentId) map.set(it.documentId, it)
    }
    return Array.from(map.values()).sort((a, b) => {
      const da = new Date(a.createdAt).getTime()
      const db = new Date(b.createdAt).getTime()
      return da - db
    })
  }

  async function loadMoreMessages(id: string): Promise<void> {
    const bucket = ensureMessageBucket(id)
    if (!bucket.hasMore || !bucket.nextCursor || bucket.loading) return

    patchMessageState(id, { loading: true })
    try {
      const resp = await fetchMessagesPage(id, bucket.nextCursor)
      const incoming = resp?.data ?? []
      patchMessageState(id, {
        items: [...incoming, ...bucket.items],
        hasMore: !!resp?.meta?.hasMore,
        nextCursor: resp?.meta?.nextCursor ?? null,
        loading: false,
      })
    } catch (err) {
      patchMessageState(id, { loading: false })
      throw err
    }
  }

  async function markConversationAsRead(id: string): Promise<void> {
    const conv = conversations.value.find((c) => c.id === id)
    if (!conv || conv.unread <= 0) return

    conversations.value = conversations.value.map((c) =>
      c.id === id ? { ...c, unread: 0 } : c,
    )
    const bucket = messagesById.value[id]
    if (bucket?.items?.length) {
      patchMessageState(id, {
        items: bucket.items.map((it) => (it.isRead ? it : { ...it, isRead: true })),
      })
    }

    try {
      await api.markKnockRead(id)
    } catch {
      // 静默失败：下次 SSE 或刷新时会自我修复
    }
  }

  // ── SSE 实时推送 ──
  function scheduleRefresh() {
    if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer)
    refreshDebounceTimer = setTimeout(() => {
      refreshDebounceTimer = null
      void refresh()
    }, REFRESH_DEBOUNCE_MS)
  }

  function handleSseEvent(event: KnockSseEvent) {
    if (event.type === "notification.created") {
      scheduleRefresh()
      const activeId = activeConversationId.value
      const targetId = event.conversationId ?? activeId
      if (targetId && targetId !== activeId) {
        const bucket = messagesById.value[targetId]
        if (bucket?.hydrated) {
          patchMessageState(targetId, { hydrated: false })
        }
      }
      if (activeId && messagesById.value[activeId]?.hydrated) {
        void ensureMessages(activeId, true)
      }
      return
    }

    if (event.type === "notification.read" || event.type === "notification.read.bulk") {
      scheduleRefresh()
    }
  }

  function startStream() {
    if (typeof window === "undefined") return
    if (sseStarted) return
    const token = localStorage.getItem(TOKEN_KEY) || ""
    if (!token) return
    sseStarted = true
    void runStream(token)
  }

  async function runStream(token: string) {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ""
    const url = `${apiBaseUrl.replace(/\/$/, "")}/api/knock/stream`
    const controller = new AbortController()
    sseAbortController = controller

    try {
      const stream = fetchSSE<any>(url, { token, signal: controller.signal })
      for await (const evt of stream) {
        sseFailureStreak = 0
        if (evt.type === "hello") continue
        if (evt.type === "bye") { stopStream(); return }
        if (evt.type === "notification.created" || evt.type === "notification.read" || evt.type === "notification.read.bulk") {
          try {
            handleSseEvent({ ...(evt.data || {}), type: evt.type } as KnockSseEvent)
          } catch {
            /* malformed payload */
          }
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === "AbortError") return
      sseFailureStreak += 1
      if (sseFailureStreak >= MAX_CONSECUTIVE_SSE_FAILURES) {
        stopStream()
        return
      }
    }

    if (sseStarted && !controller.signal.aborted) {
      sseStarted = false
      setTimeout(() => startStream(), 2000)
    }
  }

  function stopStream() {
    if (sseAbortController) {
      sseAbortController.abort()
      sseAbortController = null
    }
    sseStarted = false
    sseFailureStreak = 0
    if (refreshDebounceTimer) {
      clearTimeout(refreshDebounceTimer)
      refreshDebounceTimer = null
    }
  }

  function reset() {
    stopStream()
    conversations.value = []
    isLoading.value = false
    error.value = null
    truncated.value = false
    messagesById.value = {}
    activeConversationId.value = null
  }

  return {
    conversations: computed(() => conversations.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    truncated: computed(() => truncated.value),
    refresh,
    messageStateOf: (id: string) =>
      computed(() => messagesById.value[id] ?? emptyMessageState()),
    ensureMessages,
    loadMoreMessages,
    markConversationAsRead,
    activeConversationId,
    startStream,
    stopStream,
    reset,
  }
}
