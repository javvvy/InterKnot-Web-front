/**
 * useKkCall —— 敲敲通话视图（角色卡 + 会话 + 消息 + SSE 流式发送）
 */

import { ref, computed, type ComputedRef } from "vue"
import { fetchSSE, type SseEvent } from "@/utils/sse"
import { useApi } from "./useApi"
import type { KkCallCharacter, KkCallMessage, KkCallSessionSummary } from "@/types/entities"

const TOKEN_KEY = "access_token"

interface MessagesResponse {
  data: KkCallMessage[]
  meta?: { hasMore?: boolean; nextCursor?: string | null }
}

export interface KkCallMessageState {
  items: KkCallMessage[]
  loading: boolean
  hasMore: boolean
  nextCursor: string | null
  hydrated: boolean
}

const emptyMessageState = (): KkCallMessageState => ({
  items: [],
  loading: false,
  hasMore: false,
  nextCursor: null,
  hydrated: false,
})

interface UseKkCall {
  sessions: ComputedRef<KkCallSessionSummary[]>
  isLoading: ComputedRef<boolean>
  error: ComputedRef<string | null>
  refresh: () => Promise<void>
  ensureMessages: (id: string, force?: boolean) => Promise<void>
  loadMoreMessages: (id: string) => Promise<void>
  messageStateOf: (id: string) => KkCallMessageState
  sendMessage: (
    sessionId: string,
    content: string,
  ) => {
    realId: Promise<string>
    done: Promise<void>
    abort: () => void
  }
}

// 模块级单例状态：KnockKnockModal 与 KkCallPanel 共享同一份会话与消息状态。
// 否则会话实质化（pseudo → real）只更新了 Panel 内部的状态，左侧会话列表不会刷新。
const sessions = ref<KkCallSessionSummary[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const messagesById = ref<Record<string, KkCallMessageState>>({})

const normalizeCharacter = (c: any): KkCallCharacter | null => {
  if (!c) return null
  return {
    documentId: (c.characterNo ?? c.documentId ?? "") as string,
    name: (c.name ?? "") as string,
    avatar: (c.avatar ?? null) as string | null,
    tagline: (c.tagline ?? "") as string,
    tags: typeof c.tags === "string"
      ? c.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : ((c.tags ?? []) as string[]),
    displayOrder: (c.displayOrder ?? 0) as number,
  }
}

const toMessage = (raw: any): KkCallMessage | null => {
  const id = raw?.messageNo ?? raw?.documentId
  if (!id) return null
  return {
    documentId: String(id),
    role: raw.role === "user" || raw.role === "assistant" ? raw.role : "assistant",
    content: (raw.content ?? "") as string,
    pending: !!raw.pending,
    errorReason: (raw.errorReason ?? null) as string | null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  }
}

export function useKkCall(): UseKkCall {
  const api = useApi()

  async function refresh(): Promise<void> {
    if (isLoading.value) return
    isLoading.value = true
    error.value = null
    try {
      const resp = await api.getKkCallSessions()
      sessions.value = Array.isArray(resp) ? resp : Array.isArray(resp?.data) ? resp.data : []
    } catch (err: any) {
      error.value = err?.message || "加载失败"
    } finally {
      isLoading.value = false
    }
  }

  function ensureBucket(id: string): KkCallMessageState {
    let bucket = messagesById.value[id]
    if (!bucket) {
      bucket = emptyMessageState()
      messagesById.value = { ...messagesById.value, [id]: bucket }
    }
    return bucket
  }

  function patchBucket(id: string, patch: Partial<KkCallMessageState>) {
    const prev = messagesById.value[id] ?? emptyMessageState()
    messagesById.value = {
      ...messagesById.value,
      [id]: { ...prev, ...patch },
    }
  }

  const sortAsc = (items: KkCallMessage[]): KkCallMessage[] => {
    const copy = items.slice()
    copy.sort((a, b) => {
      const da = new Date(a.createdAt).getTime()
      const db = new Date(b.createdAt).getTime()
      if (Number.isNaN(da) || Number.isNaN(db)) return 0
      return da - db
    })
    return copy
  }

  const mergeMessages = (existing: KkCallMessage[], incoming: KkCallMessage[]): KkCallMessage[] => {
    if (incoming.length === 0) return existing
    const map = new Map<string, KkCallMessage>()
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

  async function ensureMessages(id: string, force = false): Promise<void> {
    const bucket = ensureBucket(id)
    if (bucket.hydrated && !force) return
    if (bucket.loading) return
    patchBucket(id, { loading: true })
    try {
      const resp = await api.getKkCallMessages(id)
      const incoming = sortAsc(Array.isArray(resp) ? resp : (resp?.data ?? []))
      patchBucket(id, {
        items: incoming,
        hasMore: Array.isArray(resp) ? false : !!(resp?.meta?.hasMore),
        nextCursor: Array.isArray(resp) ? null : (resp?.meta?.nextCursor ?? null),
        hydrated: true,
        loading: false,
      })
    } catch (err) {
      patchBucket(id, { loading: false })
      throw err
    }
  }

  async function loadMoreMessages(id: string): Promise<void> {
    const bucket = ensureBucket(id)
    if (!bucket.hasMore || !bucket.nextCursor || bucket.loading) return
    patchBucket(id, { loading: true })
    try {
      const resp = await api.getKkCallMessages(id, bucket.nextCursor)
      const olderAsc = sortAsc(Array.isArray(resp) ? resp : (resp?.data ?? []))
      patchBucket(id, {
        items: [...olderAsc, ...bucket.items],
        hasMore: Array.isArray(resp) ? false : !!(resp?.meta?.hasMore),
        nextCursor: Array.isArray(resp) ? null : (resp?.meta?.nextCursor ?? null),
        loading: false,
      })
    } catch (err) {
      patchBucket(id, { loading: false })
      throw err
    }
  }

  const sendMessage = (sessionId: string, content: string) => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ""
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) || "" : ""

    const url = `${apiBaseUrl.replace(/\/$/, "")}/api/kk-call/sessions/${encodeURIComponent(sessionId)}/messages`

    const abortController = new AbortController()
    let resolveRealId: (id: string) => void = () => {}
    let rejectRealId: (e: unknown) => void = () => {}
    const realIdPromise = new Promise<string>((resolve, reject) => {
      resolveRealId = resolve
      rejectRealId = reject
    })

    let currentBucketId = sessionId
    let assistantMsgId: string | null = null

    const migratePseudoToReal = (realId: string, character: KkCallCharacter | null) => {
      if (currentBucketId === realId) return
      const oldBucket = messagesById.value[currentBucketId]
      const newBucket = messagesById.value[realId]
      const merged: KkCallMessageState = newBucket
        ? {
            ...newBucket,
            items: mergeMessages(newBucket.items, oldBucket?.items ?? []),
            hydrated: newBucket.hydrated || !!oldBucket?.hydrated,
          }
        : {
            items: oldBucket?.items ?? [],
            loading: false,
            hasMore: false,
            nextCursor: null,
            hydrated: true,
          }
      const next = { ...messagesById.value, [realId]: merged }
      delete next[currentBucketId]
      messagesById.value = next

      sessions.value = sessions.value.map((s) =>
        s.documentId === currentBucketId
          ? { ...s, documentId: realId, isPseudo: false, character: character || s.character }
          : s,
      )

      currentBucketId = realId
    }

    const upsertMessage = (msg: KkCallMessage) => {
      const bucket = messagesById.value[currentBucketId]
      if (!bucket) {
        patchBucket(currentBucketId, { items: [msg], hydrated: true })
        return
      }
      patchBucket(currentBucketId, { items: mergeMessages(bucket.items, [msg]) })
    }

    const patchAssistant = (patch: Partial<KkCallMessage>) => {
      if (!assistantMsgId) return
      const bucket = messagesById.value[currentBucketId]
      if (!bucket?.items?.length) return
      patchBucket(currentBucketId, {
        items: bucket.items.map((m) =>
          m.documentId === assistantMsgId ? { ...m, ...patch } : m,
        ),
      })
    }

    const done = (async () => {
      try {
        const stream = fetchSSE<any>(url, {
          method: "POST",
          body: { content },
          token,
          signal: abortController.signal,
        })

        for await (const evt of stream as AsyncIterable<SseEvent<any>>) {
          handleEvent(evt)
        }
      } catch (err: any) {
        if (err?.name === "AbortError" || abortController.signal.aborted) {
          patchAssistant({ pending: false, errorReason: "aborted" })
          return
        }
        patchAssistant({
          pending: false,
          errorReason: err?.status ? `http_${err.status}` : "network_error",
        })
        throw err
      } finally {
        patchAssistant({ pending: false })
        void refresh()
      }
    })()

    function handleEvent(evt: SseEvent<any>) {
      const data = evt.data
      switch (evt.type) {
        case "session.materialized": {
          const realId = String(data?.sessionId || "")
          const character = normalizeCharacter(data?.character)
          if (realId) {
            migratePseudoToReal(realId, character)
            resolveRealId(realId)
          }
          break
        }
        case "message.user.created": {
          const msg = toMessage(data)
          if (msg) upsertMessage(msg)
          if (currentBucketId === sessionId && !sessionId.startsWith("pseudo:")) {
            resolveRealId(sessionId)
          }
          break
        }
        case "message.assistant.started": {
          const msg = toMessage(data)
          if (msg) {
            assistantMsgId = msg.documentId
            upsertMessage({ ...msg, pending: true })
          }
          break
        }
        case "message.assistant.delta": {
          const delta = typeof data?.delta === "string" ? data.delta : ""
          if (!delta || !assistantMsgId) break
          const bucket = messagesById.value[currentBucketId]
          if (!bucket?.items?.length) break
          patchBucket(currentBucketId, {
            items: bucket.items.map((m) =>
              m.documentId === assistantMsgId ? { ...m, content: (m.content || "") + delta } : m,
            ),
          })
          break
        }
        case "message.assistant.done": {
          const fullContent = typeof data?.content === "string" ? data.content : null
          patchAssistant({
            pending: false,
            errorReason: null,
            ...(fullContent != null ? { content: fullContent } : {}),
          })
          break
        }
        case "error": {
          const code = typeof data?.code === "string" ? data.code : "stream_error"
          patchAssistant({ pending: false, errorReason: code })
          break
        }
      }
    }

    if (!sessionId.startsWith("pseudo:")) {
      resolveRealId(sessionId)
    }
    done.catch((e) => rejectRealId(e))

    return {
      realId: realIdPromise,
      done,
      abort: () => {
        try { abortController.abort() } catch { /* noop */ }
      },
    }
  }

  return {
    sessions: computed(() => sessions.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    refresh,
    ensureMessages,
    loadMoreMessages,
    messageStateOf: (id: string) => messagesById.value[id] ?? emptyMessageState(),
    sendMessage,
  }
}
