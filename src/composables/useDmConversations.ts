/**
 * useDmConversations —— DM 私聊数据层（REST + WS 双路径合并）
 *
 * 使用模块级 ref 共享状态（替代 Nuxt useState），多个组件调用同一 composable 拿到同一份缓存。
 * 与 useKnockKnockConversations 的核心差异：走 /api/dm/* 路径，使用 WebSocket（非 SSE）。
 */

import { ref, computed, type ComputedRef, type Ref } from "vue"
import { useApi, normalizeDmMessage } from "./useApi"
import { useAuthStore } from "@/stores/auth"
import { useDmStream } from "./useDmStream"
import type {
  DmConversationSummary,
  DmMessage,
  DmMessageKind,
  DmWsEvent,
} from "@/types/entities"

interface ConversationMessageState {
  items: DmMessage[]
  loading: boolean
  hasMore: boolean
  nextCursor: string | null
  hydrated: boolean
}

const emptyMessageState = (): ConversationMessageState => ({
  items: [],
  loading: false,
  hasMore: false,
  nextCursor: null,
  hydrated: false,
})

interface UseDmConversations {
  conversations: ComputedRef<DmConversationSummary[]>
  isLoading: ComputedRef<boolean>
  error: ComputedRef<string | null>
  totalUnread: ComputedRef<number>
  activeConversationId: Ref<string | null>
  typingByConversation: ComputedRef<Record<string, string[]>>
  refresh: () => Promise<void>
  openDirectConversation: (targetUserNo: string) => Promise<{ summary: DmConversationSummary; isNew: boolean }>
  messageStateOf: (id: string) => ConversationMessageState
  ensureMessages: (id: string, force?: boolean) => Promise<void>
  loadMoreMessages: (id: string) => Promise<void>
  sendMessage: (conversationId: string, payload: { content: string; kind?: DmMessageKind; replyTo?: string }) => Promise<DmMessage>
  editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>
  withdrawMessage: (conversationId: string, messageId: string) => Promise<void>
  markConversationAsRead: (id: string) => Promise<void>
  updateConversation: (id: string, patch: { muted?: boolean; pinned?: boolean; title?: string }) => Promise<void>
  leaveConversation: (id: string) => Promise<void>
  sendTyping: (conversationId: string) => void
  startStream: () => void
  stopStream: () => void
  reset: () => void
}

// ── 模块级单例 ──
let unsubscribeAll: Array<() => void> = []
let subscribed = false
let typingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const TYPING_TTL_MS = 4_000

export function useDmConversations(): UseDmConversations {
  const conversations = ref<DmConversationSummary[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const messagesById = ref<Record<string, ConversationMessageState>>({})
  const activeConversationId = ref<string | null>(null)
  const typing = ref<Record<string, string[]>>({})

  const api = useApi()
  const auth = useAuthStore()
  const stream = useDmStream()

  const selfUserId = computed<string | null>(() => {
    return auth.user?.authorId || auth.user?.documentId || null
  })

  // ── 基础工具 ──
  const ensureMessageBucket = (id: string): ConversationMessageState => {
    let bucket = messagesById.value[id]
    if (!bucket) {
      bucket = emptyMessageState()
      messagesById.value = { ...messagesById.value, [id]: bucket }
    }
    return bucket
  }

  const patchMessageState = (id: string, patch: Partial<ConversationMessageState>) => {
    const prev = messagesById.value[id] ?? emptyMessageState()
    messagesById.value = { ...messagesById.value, [id]: { ...prev, ...patch } }
  }

  const mergeMessages = (existing: DmMessage[], incoming: DmMessage[]): DmMessage[] => {
    if (incoming.length === 0) return existing
    const map = new Map<string, DmMessage>()
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

  const upsertConversation = (next: DmConversationSummary): void => {
    const list = conversations.value
    const idx = list.findIndex((c) => c.documentId === next.documentId)
    let copy: DmConversationSummary[]
    if (idx >= 0) {
      copy = list.slice()
      copy[idx] = next
    } else {
      copy = [next, ...list]
    }
    copy.sort((a, b) => {
      const ap = a.self?.pinned ? 1 : 0
      const bp = b.self?.pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bt - at
    })
    conversations.value = copy
  }

  const patchConversation = (id: string, patch: Partial<DmConversationSummary>, resort = false) => {
    const list = conversations.value
    const idx = list.findIndex((c) => c.documentId === id)
    if (idx < 0) return
    const copy = list.slice()
    copy[idx] = { ...copy[idx], ...patch } as DmConversationSummary
    if (resort) {
      copy.sort((a, b) => {
        const ap = a.self?.pinned ? 1 : 0
        const bp = b.self?.pinned ? 1 : 0
        if (ap !== bp) return bp - ap
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return bt - at
      })
    }
    conversations.value = copy
  }

  const removeConversation = (id: string): void => {
    conversations.value = conversations.value.filter((c) => c.documentId !== id)
    if (messagesById.value[id]) {
      const next = { ...messagesById.value }
      delete next[id]
      messagesById.value = next
    }
  }

  const toAsc = (items: DmMessage[]): DmMessage[] => {
    const copy = items.slice()
    copy.reverse()
    return copy
  }

  // ── REST ──
  async function refresh(): Promise<void> {
    if (isLoading.value) return
    isLoading.value = true
    error.value = null
    try {
      const list = await api.getDmConversations()
      conversations.value = list ?? []
    } catch (err: any) {
      error.value = err?.message || "加载失败"
    } finally {
      isLoading.value = false
    }
  }

  async function openDirectConversation(targetUserNo: string): Promise<{ summary: DmConversationSummary; isNew: boolean }> {
    const { summary, isNew } = await api.postDirectConversationByDocId(targetUserNo)
    if (!summary?.documentId) throw new Error("invalid direct response")
    upsertConversation(summary)
    return { summary, isNew }
  }

  async function materializePseudoUserConversation(pseudoId: string): Promise<DmConversationSummary | null> {
    const docMatch = /^pseudo:user:(.+)$/.exec(pseudoId)
    if (!docMatch || !docMatch[1]) return null
    const summary = (await openDirectConversation(docMatch[1])).summary
    if (!summary) return null

    const pseudoBucket = messagesById.value[pseudoId]
    if (pseudoBucket?.hydrated) {
      const realBucket = messagesById.value[summary.documentId]
      if (!realBucket || !realBucket.hydrated) {
        // 只拷贝 items 到真实 bucket，不继承 hydrated 状态
        // 避免跳过后续 ensureMessages 的 API 请求（API 返回的数据才完整）
        patchMessageState(summary.documentId, {
          items: pseudoBucket.items ?? [],
          hasMore: false,
          nextCursor: null,
          hydrated: false,
          loading: false,
        })
      } else {
        patchMessageState(summary.documentId, {
          items: mergeMessages(realBucket.items, pseudoBucket.items),
          hasMore: realBucket.hasMore || pseudoBucket.hasMore,
          nextCursor: realBucket.nextCursor ?? pseudoBucket.nextCursor,
          loading: false,
        })
      }
    }

    if (activeConversationId.value === pseudoId) {
      activeConversationId.value = summary.documentId
    }
    removeConversation(pseudoId)
    return summary
  }

  async function ensureMessages(id: string, force = false): Promise<void> {
    const bucket = ensureMessageBucket(id)
    if (bucket.hydrated && !force) return
    if (bucket.loading) return

    patchMessageState(id, { loading: true })
    try {
      const resp = await api.getDmMessages(id)
      const incoming = toAsc(resp?.data ?? [])
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

  async function loadMoreMessages(id: string): Promise<void> {
    const bucket = ensureMessageBucket(id)
    if (!bucket.hasMore || !bucket.nextCursor || bucket.loading) return
    patchMessageState(id, { loading: true })
    try {
      const resp = await api.getDmMessages(id, bucket.nextCursor)
      const olderAsc = toAsc(resp?.data ?? [])
      patchMessageState(id, {
        items: [...olderAsc, ...bucket.items],
        hasMore: !!resp?.meta?.hasMore,
        nextCursor: resp?.meta?.nextCursor ?? null,
        loading: false,
      })
    } catch (err) {
      patchMessageState(id, { loading: false })
      throw err
    }
  }

  async function sendMessage(
    conversationId: string,
    payload: { content: string; kind?: DmMessageKind; replyTo?: string },
  ): Promise<DmMessage> {
    let actualId = conversationId
    if (conversationId.startsWith("pseudo:user:")) {
      const real = await materializePseudoUserConversation(conversationId)
      if (!real) throw new Error("invalid pseudo user conversation id")
      actualId = real.documentId
    } else if (conversationId === "pseudo:system" || conversationId.startsWith("pseudo:anonymous:")) {
      throw new Error("此会话不可发送消息")
    }

    const created = await api.sendDmMessage(actualId, payload)
    if (!created?.documentId) throw new Error("send returned no message")

    const bucket = ensureMessageBucket(actualId)
    if (bucket.hydrated) {
      patchMessageState(actualId, { items: mergeMessages(bucket.items, [created]) })
    }

    patchConversation(actualId, {
      lastMessage: {
        documentId: created.documentId,
        content: created.content ?? "",
        createdAt: created.createdAt,
        kind: created.kind,
        senderUserId: created.sender?.userId ?? null,
      },
      lastMessageAt: created.createdAt,
    }, true)

    return created
  }

  async function editMessage(conversationId: string, messageId: string, content: string): Promise<void> {
    await api.editDmMessage(messageId, content)
    const bucket = messagesById.value[conversationId]
    if (bucket?.items?.length) {
      const editedAt = new Date().toISOString()
      patchMessageState(conversationId, {
        items: bucket.items.map((m) =>
          m.documentId === messageId ? { ...m, content, editedAt } : m,
        ),
      })
    }
  }

  async function withdrawMessage(conversationId: string, messageId: string): Promise<void> {
    await api.deleteDmMessage(messageId)
    const bucket = messagesById.value[conversationId]
    if (bucket?.items?.length) {
      const deletedAt = new Date().toISOString()
      patchMessageState(conversationId, {
        items: bucket.items.map((m) =>
          m.documentId === messageId ? { ...m, deletedAt, content: null } : m,
        ),
      })
    }
  }

  async function markConversationAsRead(id: string): Promise<void> {
    const conv = conversations.value.find((c) => c.documentId === id)
    if (!conv || conv.unreadCount === 0) return
    patchConversation(id, { unreadCount: 0 })
    try {
      await api.markDmConversationRead(id)
    } catch { /* 静默失败 */ }
  }

  async function updateConversation(id: string, patch: { muted?: boolean; pinned?: boolean; title?: string }): Promise<void> {
    await api.updateDmConversation(id, patch)
    const conv = conversations.value.find((c) => c.documentId === id)
    if (conv) {
      const nextSelf = { ...conv.self }
      if (typeof patch.muted === "boolean") nextSelf.muted = patch.muted
      if (typeof patch.pinned === "boolean") nextSelf.pinned = patch.pinned
      patchConversation(id, {
        self: nextSelf,
        ...(typeof patch.title === "string" ? { title: patch.title } : {}),
      }, typeof patch.pinned === "boolean")
    }
  }

  async function leaveConversation(id: string): Promise<void> {
    await api.leaveDmConversation(id)
    conversations.value = conversations.value.filter((c) => c.documentId !== id)
    if (activeConversationId.value === id) activeConversationId.value = null
    if (messagesById.value[id]) {
      const next = { ...messagesById.value }
      delete next[id]
      messagesById.value = next
    }
  }

  // ── WS 事件处理 ──
  const onMessageCreated = (event: DmWsEvent<{ message: unknown }>) => {
    const cid = event.conversationId
    const rawMsg = event.data?.message as any
    if (!cid || !rawMsg) return
    const msg = normalizeDmMessage(rawMsg) as DmMessage
    if (!msg?.documentId) return

    const senderUserId = msg.sender?.userId
    const isMine = selfUserId.value != null && senderUserId === selfUserId.value

    // pseudo 自动迁移
    if (!isMine && typeof senderUserId === "string") {
      const pseudoId = `pseudo:user:${senderUserId}`
      const pseudoIsActive = activeConversationId.value === pseudoId
      const pseudoExists = conversations.value.some((c) => c.documentId === pseudoId)
      const realExists = conversations.value.some((c) => c.documentId === cid)
      if (pseudoExists && !realExists) {
        const pseudoBucket = messagesById.value[pseudoId]
        if (pseudoBucket?.items?.length) {
          const realBucket = messagesById.value[cid]
          // 合并伪会话的 items，但不继承其 hydrated 状态
          // 确保后续 ensureMessages 仍会发起 API 请求获取完整数据
          patchMessageState(cid, {
            items: mergeMessages(realBucket?.items ?? [], pseudoBucket.items),
            hasMore: realBucket?.hasMore ?? pseudoBucket.hasMore,
            nextCursor: realBucket?.nextCursor ?? pseudoBucket.nextCursor,
            loading: false,
          })
        }
        if (pseudoIsActive) activeConversationId.value = cid
        removeConversation(pseudoId)
      }
    }

    const bucket = messagesById.value[cid]
    if (bucket?.hydrated) {
      patchMessageState(cid, { items: mergeMessages(bucket.items, [msg]) })
    }

    const conv = conversations.value.find((c) => c.documentId === cid)
    const isActive = activeConversationId.value === cid

    if (conv) {
      const nextLast = {
        documentId: msg.documentId,
        content: msg.content ?? "",
        createdAt: msg.createdAt,
        kind: msg.kind,
        senderUserId: msg.sender?.userId ?? null,
      }
      const nextUnread = isMine || isActive ? conv.unreadCount : conv.unreadCount + 1
      patchConversation(cid, {
        lastMessage: nextLast,
        lastMessageAt: msg.createdAt,
        unreadCount: nextUnread,
      }, true)
    } else {
      void refresh()
    }

    if (isActive && !isMine) {
      void markConversationAsRead(cid)
    }
  }

  const onMessageEdited = (event: DmWsEvent<{ content: string; editedAt: string }>) => {
    const cid = event.conversationId
    const mid = event.messageId
    const data = event.data
    if (!cid || !mid || !data) return
    const bucket = messagesById.value[cid]
    if (!bucket?.items?.length) return
    patchMessageState(cid, {
      items: bucket.items.map((m) =>
        m.documentId === mid ? { ...m, content: data.content, editedAt: data.editedAt } : m,
      ),
    })
  }

  const onMessageDeleted = (event: DmWsEvent<{ deletedAt: string }>) => {
    const cid = event.conversationId
    const mid = event.messageId
    if (!cid || !mid) return
    const bucket = messagesById.value[cid]
    if (!bucket?.items?.length) return
    patchMessageState(cid, {
      items: bucket.items.map((m) =>
        m.documentId === mid ? { ...m, content: null, deletedAt: event.data?.deletedAt ?? new Date().toISOString() } : m,
      ),
    })
    const conv = conversations.value.find((c) => c.documentId === cid)
    if (conv?.lastMessage?.documentId === mid) {
      patchConversation(cid, { lastMessage: { ...conv.lastMessage, content: "" } })
    }
  }

  const onConversationRead = (event: DmWsEvent<{ lastReadAt: string }>) => {
    const cid = event.conversationId
    const data = event.data
    if (!cid || !data) return
    const conv = conversations.value.find((c) => c.documentId === cid)
    if (!conv) return
    patchConversation(cid, { unreadCount: 0, self: { ...conv.self, lastReadAt: data.lastReadAt } })
  }

  const onConversationUpdated = (event: DmWsEvent<{ title?: string }>) => {
    const cid = event.conversationId
    const data = event.data
    if (!cid || !data) return
    patchConversation(cid, { ...(typeof data.title === "string" ? { title: data.title } : {}) })
  }

  const onConversationMemberRemoved = (event: DmWsEvent<{ userId: number }>) => {
    if (!event.conversationId) return
    void refresh()
  }

  const onTyping = (event: DmWsEvent<{ userId: string }>) => {
    const cid = event.conversationId
    const uid = event.data?.userId
    if (!cid || typeof uid !== "string") return
    const current = typing.value[cid] ?? []
    if (!current.includes(uid)) {
      typing.value = { ...typing.value, [cid]: [...current, uid] }
    }
    const key = `${cid}:${uid}`
    const oldTimer = typingTimers.get(key)
    if (oldTimer) clearTimeout(oldTimer)
    const timer = setTimeout(() => {
      typingTimers.delete(key)
      const list = typing.value[cid] ?? []
      const next = list.filter((id) => id !== uid)
      if (next.length === 0) {
        const copy = { ...typing.value }
        delete copy[cid]
        typing.value = copy
      } else {
        typing.value = { ...typing.value, [cid]: next }
      }
    }, TYPING_TTL_MS)
    typingTimers.set(key, timer)
  }

  const startStream = () => {
    if (subscribed) {
      stream.start()
      return
    }
    subscribed = true
    stream.start()

    unsubscribeAll.push(stream.on("message.created", onMessageCreated))
    unsubscribeAll.push(stream.on("message.edited", onMessageEdited))
    unsubscribeAll.push(stream.on("message.deleted", onMessageDeleted))
    unsubscribeAll.push(stream.on("conversation.read", onConversationRead))
    unsubscribeAll.push(stream.on("conversation.updated", onConversationUpdated))
    unsubscribeAll.push(stream.on("conversation.member.removed", onConversationMemberRemoved))
    unsubscribeAll.push(stream.on("typing", onTyping))
  }

  const stopStream = () => {
    for (const off of unsubscribeAll) {
      try { off() } catch { /* noop */ }
    }
    unsubscribeAll = []
    subscribed = false
    stream.stop()
    for (const t of typingTimers.values()) clearTimeout(t)
    typingTimers.clear()
    typing.value = {}
  }

  const reset = () => {
    stopStream()
    conversations.value = []
    isLoading.value = false
    error.value = null
    messagesById.value = {}
    activeConversationId.value = null
    typing.value = {}
  }

  const totalUnread = computed(() =>
    conversations.value.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
  )

  return {
    conversations: computed(() => conversations.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    totalUnread,
    activeConversationId,
    typingByConversation: computed(() => typing.value),
    refresh,
    openDirectConversation,
    messageStateOf: (id: string) => messagesById.value[id] ?? emptyMessageState(),
    ensureMessages,
    loadMoreMessages,
    sendMessage,
    editMessage,
    withdrawMessage,
    markConversationAsRead,
    updateConversation,
    leaveConversation,
    sendTyping: (conversationId: string) => stream.sendTyping(conversationId, selfUserId.value),
    startStream,
    stopStream,
    reset,
  }
}
