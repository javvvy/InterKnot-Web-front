<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue"
import {
  PhoneIcon, UserIcon, UserGroupIcon,
  ChatBubbleLeftIcon, PaperAirplaneIcon,
} from "@heroicons/vue/24/solid"
import { DocumentTextIcon } from "@heroicons/vue/24/outline"
import { useAuthStore } from "@/stores/auth"
import { useKnockKnockModal } from "@/composables/useKnockKnockModal"
import { useDmConversations } from "@/composables/useDmConversations"
import { useKkCall } from "@/composables/useKkCall"
import { useDiscussionModal } from "@/composables/useDiscussionModal"
import { formatTime } from "@/utils/time"
import KkCallSessionList from "./KkCallSessionList.vue"
import KkCallPanel from "./KkCallPanel.vue"
import type { DmConversationSummary, DmMessage, DmMessageKind } from "@/types/entities"

const {
  visible, close, consumePendingDmConversationId,
  consumePendingKkCallSessionId, updateUrl,
} = useKnockKnockModal()
const auth = useAuthStore()
const postModal = useDiscussionModal()

type KnockTab = "calls" | "contacts" | "groups"
const activeTab = ref<KnockTab>("contacts")

// KKCall state
const {
  sessions: kkSessions, isLoading: kkLoading, error: kkError, refresh: kkRefresh,
} = useKkCall()
const activeKkCallId = ref<string | null>(null)

// DM state
const {
  conversations: allConversations, isLoading, error: loadError,
  refresh, ensureMessages, messageStateOf, markConversationAsRead,
  sendMessage, editMessage, withdrawMessage, activeConversationId,
  typingByConversation, sendTyping, startStream, stopStream,
} = useDmConversations()

const selfUserId = computed<string | null>(() => {
  return auth.user?.authorId || auth.user?.documentId || null
})

// Modal lifecycle
watch(visible, async (next) => {
  if (!next) {
    activeConversationId.value = null
    activeKkCallId.value = null
    stopStream()
    return
  }
  startStream()
  await refresh()
  const pendingKk = consumePendingKkCallSessionId()
  if (pendingKk) {
    activeTab.value = "calls"
    // 加载 kk-call 会话列表以便解析伪 ID 到真实 ID
    await kkRefresh()
    // 如果 pendingKk 是伪会话 ID 但已有真实会话，自动解析为真实 ID
    let resolvedId = pendingKk
    if (pendingKk.startsWith("pseudo:char:")) {
      const charId = pendingKk.slice("pseudo:char:".length)
      const real = kkSessions.value.find(
        (s) => !s.isPseudo && s.character?.documentId === charId,
      )
      if (real) resolvedId = real.documentId
    }
    activeKkCallId.value = resolvedId
    updateUrl("calls", resolvedId)
  } else {
    if (activeTab.value === "calls") void kkRefresh()
    const pendingDm = consumePendingDmConversationId()
    if (pendingDm) {
      activeTab.value = "contacts"
      activeConversationId.value = pendingDm
      updateUrl("contacts", pendingDm)
    }
  }
})

// Tab handling
const switchTab = (tab: KnockTab) => {
  if (tab === "groups") return
  activeTab.value = tab
  if (tab === "calls") {
    activeConversationId.value = null
    void kkRefresh()
    updateUrl("calls", activeKkCallId.value)
  } else {
    activeKkCallId.value = null
    updateUrl("contacts", activeConversationId.value)
  }
}

// Esc: 优先关闭上下文菜单 → 编辑模式 → 弹窗本体
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key !== "Escape" || !visible.value) return
  if (document.querySelectorAll(".ik-overlay").length > 1) return
  if (contextTargetMsg.value) { closeContextMenu(); return }
  if (editingMessageId.value) { cancelEdit(); return }
  close()
}
onMounted(() => { window.addEventListener("keydown", onKeyDown) })
onBeforeUnmount(() => { window.removeEventListener("keydown", onKeyDown) })

const handleClose = () => { close() }
const handleBackdropMouseDown = (e: MouseEvent) => {
  if (e.target === e.currentTarget) handleClose()
}

// DM list
const conversations = computed<DmConversationSummary[]>(() => {
  if (activeTab.value !== "contacts") return []
  return allConversations.value
})

const activeConversation = computed<DmConversationSummary | null>(() => {
  if (!activeConversationId.value) return null
  return conversations.value.find((c) => c.documentId === activeConversationId.value) ?? null
})

const composerDisabled = computed<boolean>(() => {
  const conv = activeConversation.value
  if (!conv) return true
  return conv.pseudoKind === "anonymous" || conv.pseudoKind === "system"
})

const peerIsTyping = computed<boolean>(() => {
  const cid = activeConversationId.value
  if (!cid) return false
  const list = typingByConversation.value[cid]
  if (!list || list.length === 0) return false
  const self = selfUserId.value
  return list.some((uid) => uid !== self)
})

const conversationPreview = (conv: DmConversationSummary): string => {
  const last = conv.lastMessage
  if (!last) return ""
  if (last.kind === "image") return "[图片]"
  if (last.kind === "system") return last.content || ""
  return last.content || ""
}

// Messages
const messagesRef = ref<HTMLElement | null>(null)
const messagesSettling = ref(false)
const knownMessageIds = ref(new Set<string>())
const TIME_GAP_MS = 5 * 60 * 1000
const NEAR_BOTTOM_THRESHOLD_PX = 80
const wasNearBottom = ref(true)

const isNearBottom = (el: HTMLElement): boolean =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD_PX

const scrollToBottom = (el: HTMLElement) => {
  const doScroll = () => { el.scrollTop = el.scrollHeight }
  doScroll()
  requestAnimationFrame(doScroll)
  setTimeout(doScroll, 200)
}

const activeMessageState = computed(() => {
  const id = activeConversationId.value
  if (!id) return null
  return messageStateOf(id)
})

const activeMessages = computed<DmMessage[]>(() => activeMessageState.value?.items ?? [])
const activeMessageLoading = computed<boolean>(() => {
  const s = activeMessageState.value
  return !!s && s.loading && !s.hydrated
})

const isMine = (msg: DmMessage): boolean => {
  if (msg.kind === "notification") return false
  const uid = selfUserId.value
  return uid != null && msg.sender?.userId === uid
}

const shouldShowTime = (index: number): boolean => {
  const list = activeMessages.value
  const curr = list[index]
  if (!curr) return false
  if (index === 0) return true
  const prev = list[index - 1]
  if (!prev) return true
  const dCurr = new Date(curr.createdAt).getTime()
  const dPrev = new Date(prev.createdAt).getTime()
  if (Number.isNaN(dCurr) || Number.isNaN(dPrev)) return false
  return dCurr - dPrev > TIME_GAP_MS
}

const EDIT_WINDOW_MS = 5 * 60 * 1000
const canModifyMessage = (msg: DmMessage): boolean => {
  if (!isMine(msg)) return false
  if (msg.deletedAt) return false
  if (msg.kind !== "text") return false
  return Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS
}

interface EnrichedMessage {
  msg: DmMessage
  isMine: boolean
  isNew: boolean
  showTime: boolean
}

const enrichedMessages = computed<EnrichedMessage[]>(() => {
  const list = activeMessages.value
  const known = knownMessageIds.value
  return list.map((msg, idx) => ({
    msg,
    isMine: isMine(msg),
    isNew: !known.has(msg.documentId),
    showTime: shouldShowTime(idx),
  }))
})

watch(activeConversationId, async (id) => {
  editingMessageId.value = null
  editingDraft.value = ""
  if (!id) return
  wasNearBottom.value = true
  messagesSettling.value = true
  try {
    await ensureMessages(id)
  } catch (err: any) {
    sendError.value = err?.message || "加载消息失败"
  }
  if (activeConversationId.value !== id) { messagesSettling.value = false; return }
  knownMessageIds.value = new Set(activeMessages.value.map((m) => m.documentId))
  void markConversationAsRead(id)
  nextTick(() => {
    const el = messagesRef.value
    if (!el) { messagesSettling.value = false; return }
    scrollToBottom(el)
    requestAnimationFrame(() => { messagesSettling.value = false })
  })
})

watch(() => activeMessages.value.length, (next, prev) => {
  if (next <= (prev ?? 0)) return
  if (!wasNearBottom.value) return
  nextTick(() => {
    const el = messagesRef.value
    if (el) scrollToBottom(el)
  })
})

const onMessagesScroll = () => {
  const el = messagesRef.value
  if (!el) return
  wasNearBottom.value = isNearBottom(el)
}

// Composer
const draft = ref("")
const sendError = ref<string | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const sendBusy = ref(false)

let typingThrottleLast = 0
let typingThrottleTimer: ReturnType<typeof setTimeout> | null = null
const onComposerInput = () => {
  const cid = activeConversationId.value
  if (!cid) return
  const now = Date.now()
  const remaining = 2000 - (now - typingThrottleLast)
  if (remaining <= 0) {
    typingThrottleLast = now
    sendTyping(cid)
  } else if (!typingThrottleTimer) {
    typingThrottleTimer = setTimeout(() => {
      typingThrottleTimer = null
      const curCid = activeConversationId.value
      if (curCid) { typingThrottleLast = Date.now(); sendTyping(curCid) }
    }, remaining)
  }
}

const composerValue = computed({
  get: () => editingMessageId.value ? editingDraft.value : draft.value,
  set: (v: string) => {
    if (editingMessageId.value) editingDraft.value = v
    else draft.value = v
  },
})

const composerPlaceholder = computed<string>(() => {
  const conv = activeConversation.value
  if (!conv) return ""
  if (conv.pseudoKind === "anonymous") return "匿名用户的通知不可回复"
  if (conv.pseudoKind === "system") return "系统通知不可回复"
  if (conv.pseudoKind === "user") return "发送将开启与该用户的私聊"
  return "输入消息，Enter 发送，Shift+Enter 换行"
})

const doSend = async () => {
  const text = draft.value.trim()
  if (!text || sendBusy.value || composerDisabled.value) return
  const cid = activeConversationId.value
  if (!cid) return

  sendError.value = null
  sendBusy.value = true
  draft.value = ""
  wasNearBottom.value = true
  try {
    await sendMessage(cid, { content: text, kind: "text" as DmMessageKind })
  } catch (err: any) {
    sendError.value = err?.message || "发送失败，请重试"
    draft.value = text
  } finally {
    sendBusy.value = false
    nextTick(() => { composerRef.value?.focus() })
  }
}

const onComposerKeyDown = (e: KeyboardEvent) => {
  if (e.key !== "Enter") return
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  doSend()
}

// Edit / Withdraw context menu
const contextMenuRef = ref<HTMLElement | null>(null)
const contextTargetMsg = ref<DmMessage | null>(null)
const contextMenuStyle = ref<Record<string, string>>({})
const editingMessageId = ref<string | null>(null)
const editingDraft = ref("")

const openContextMenu = (msg: DmMessage, event: MouseEvent) => {
  if (!canModifyMessage(msg)) return
  contextTargetMsg.value = msg
  contextMenuStyle.value = {
    position: "fixed",
    top: `${event.clientY}px`,
    left: `${event.clientX}px`,
    zIndex: "10001",
  }
  nextTick(() => {
    window.addEventListener("click", closeContextMenu, { once: true })
  })
}

const closeContextMenu = () => {
  contextTargetMsg.value = null
  contextMenuStyle.value = {}
}

const startEditMessage = () => {
  const msg = contextTargetMsg.value
  contextTargetMsg.value = null
  if (!msg?.content) return
  editingMessageId.value = msg.documentId
  editingDraft.value = msg.content
  nextTick(() => { composerRef.value?.focus() })
}

const cancelEdit = () => {
  editingMessageId.value = null
  editingDraft.value = ""
}

const submitEdit = async () => {
  const msgId = editingMessageId.value
  const text = editingDraft.value.trim()
  const cid = activeConversationId.value
  if (!msgId || !text || !cid) return
  try {
    await editMessage(cid, msgId, text)
    cancelEdit()
  } catch (err: any) {
    sendError.value = err?.message || "编辑失败"
  }
}

const doWithdraw = async () => {
  const msg = contextTargetMsg.value
  contextTargetMsg.value = null
  if (!msg) return
  const cid = activeConversationId.value
  if (!cid) return
  try {
    await withdrawMessage(cid, msg.documentId)
  } catch {
    /* silent */
  }
}

const goPost = (msg: DmMessage) => {
  if (!msg.article?.documentId) return
  postModal.open(msg.article.documentId, {
    coverAspectRatio: msg.article.coverAspectRatio ?? undefined,
    preview: { title: msg.article.title },
  })
}

// KKCall handlers
const onKkCallPick = (id: string) => {
  activeKkCallId.value = id
  updateUrl("calls", id)
}

const onKkCallMaterialized = (realId: string) => {
  activeKkCallId.value = realId
  updateUrl("calls", realId)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ik-overlay">
      <div v-if="visible" class="ik-overlay" @mousedown.self="handleBackdropMouseDown">
        <div class="ik-dialog ik-dialog--knock" @click.stop>
          <!-- Header Bar -->
          <div class="ik-knock__header">
            <div class="ik-knock__brand">
              <span class="ik-knock__brand-icon" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
                  <rect x="9" y="9" width="14" height="22" rx="3" fill="#fbfe00" stroke="#000" stroke-width="1.5" />
                  <rect x="11" y="11.5" width="10" height="14" rx="1" fill="#000" />
                  <circle cx="16" cy="28.5" r="0.9" fill="#000" />
                  <path d="M22 8 q3 -1 5 1" stroke="#fbfe00" stroke-width="1.8" stroke-linecap="round" fill="none" />
                  <path d="M22 5 q5 -1.5 8 1.5" stroke="#fbfe00" stroke-width="1.8" stroke-linecap="round" fill="none" />
                </svg>
              </span>
              <span class="ik-knock__brand-text">knock knock</span>
            </div>
            <button class="ik-dialog__close" aria-label="关闭" @click="handleClose">
              <img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" draggable="false" />
            </button>
          </div>

          <!-- Body：双栏布局 -->
          <div class="ik-knock__body">
            <!-- 左栏 -->
            <aside class="ik-knock__sidebar">
            <div class="ik-knock__tabs">
              <button
                class="ik-knock__tab" :class="{ 'is-active': activeTab === 'calls' }"
                @click="switchTab('calls')"
              >
                <PhoneIcon class="ik-knock__tab-icon" />
                <span>通话</span>
              </button>
              <button
                class="ik-knock__tab" :class="{ 'is-active': activeTab === 'contacts' }"
                @click="switchTab('contacts')"
              >
                <UserIcon class="ik-knock__tab-icon" />
                <span>私聊</span>
              </button>
              <button
                class="ik-knock__tab is-disabled"
                @click="switchTab('groups')"
              >
                <UserGroupIcon class="ik-knock__tab-icon" />
                <span>群聊</span>
              </button>
            </div>

            <!-- 通话列表 -->
            <KkCallSessionList
              v-if="activeTab === 'calls'"
              :items="kkSessions"
              :active-id="activeKkCallId"
              :is-loading="kkLoading"
              :error="kkError"
              @pick="onKkCallPick"
            />
            <!-- 私聊列表 -->
            <template v-else-if="activeTab === 'contacts'">
              <div class="ik-knock__list" role="listbox">
                <button
                  v-for="conv in conversations"
                  :key="conv.documentId"
                  type="button"
                  role="option"
                  class="ik-knock__list-item"
                  :class="{ 'is-active': activeConversationId === conv.documentId }"
                  @click="activeConversationId = conv.documentId; updateUrl('contacts', conv.documentId)"
                >
                  <span class="ik-knock__avatar" aria-hidden="true">
                    <img
                      v-if="conv.peer?.avatar"
                      :src="conv.peer.avatar"
                      :alt="conv.peer.name"
                      class="ik-knock__avatar-img"
                      draggable="false"
                    />
                    <img v-else src="/images/default-avatar.webp" alt="" class="ik-knock__avatar-img" draggable="false" />
                  </span>
                  <span class="ik-knock__item-text">
                    <span class="ik-knock__item-title">{{ conv.peer?.name || conv.title || '未知用户' }}</span>
                    <span class="ik-knock__item-subtitle">{{ conversationPreview(conv) || '暂无消息' }}</span>
                  </span>
                  <span class="ik-knock__item-badge" v-if="conv.unreadCount > 0">
                    {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
                  </span>
                  <span class="ik-knock__item-time">{{ conv.lastMessageAt ? formatTime(conv.lastMessageAt) : '' }}</span>
                </button>
                <div v-if="!conversations.length" class="ik-knock__list-empty">
                  <span v-if="isLoading">加载中…</span>
                  <span v-else-if="loadError">{{ loadError }}</span>
                  <span v-else>暂无会话</span>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="ik-knock__list-empty">暂未开放</div>
            </template>
          </aside>

          <!-- 右栏 -->
          <template v-if="activeTab === 'calls' && activeKkCallId">
            <KkCallPanel
              :session-id="activeKkCallId"
              :sessions="kkSessions"
              @session-materialized="onKkCallMaterialized"
            />
          </template>
          <template v-else-if="activeTab === 'contacts' && activeConversationId">
            <section class="ik-knock__main">
              <header class="ik-knock__main-header">
                <ChatBubbleLeftIcon class="ik-knock__main-icon" aria-hidden="true" />
                <div class="ik-knock__main-title-wrap">
                  <span class="ik-knock__main-title">
                    {{ activeConversation?.peer?.name || activeConversation?.title || '私聊' }}
                  </span>
                  <span v-if="peerIsTyping" class="ik-knock__typing-hint">对方正在输入…</span>
                </div>
              </header>

              <div class="ik-knock__main-body">
                <div
                  v-if="activeMessages.length"
                  ref="messagesRef"
                  class="ik-knock__messages"
                  :class="{ 'is-settling': messagesSettling }"
                  @scroll.passive="onMessagesScroll"
                >
                  <template v-for="entry in enrichedMessages" :key="entry.msg.documentId">
                    <div v-if="entry.showTime" class="ik-knock__time-divider" :class="{ 'is-new': entry.isNew }">
                      {{ formatTime(entry.msg.createdAt) }}
                    </div>
                    <div
                      class="ik-knock__msg"
                      :class="{ 'is-new': entry.isNew, 'is-mine': entry.isMine }"
                      @contextmenu.prevent="canModifyMessage(entry.msg) && openContextMenu(entry.msg, $event)"
                    >
                      <div class="ik-knock__msg-avatar" aria-hidden="true">
                        <img
                          v-if="entry.isMine"
                          :src="auth.user?.avatar || '/images/default-avatar.webp'"
                          alt=""
                          class="ik-knock__msg-avatar-img"
                          draggable="false"
                        />
                        <img
                          v-else-if="entry.msg.sender?.avatar"
                          :src="entry.msg.sender.avatar"
                          :alt="entry.msg.sender.name"
                          class="ik-knock__msg-avatar-img"
                          draggable="false"
                        />
                        <img
                          v-else
                          src="/images/default-avatar.webp"
                          alt=""
                          class="ik-knock__msg-avatar-img"
                          draggable="false"
                        />
                      </div>
                      <div class="ik-knock__msg-body">
                        <div class="ik-knock__msg-bubble" :class="{ 'is-notification': entry.msg.kind === 'notification' }">
                          <!-- 普通文本消息 -->
                          <template v-if="entry.msg.kind === 'text' || entry.msg.kind === 'system'">
                            <template v-if="entry.msg.deletedAt">
                              <span class="ik-knock__msg-deleted">消息已撤回</span>
                            </template>
                            <template v-else>
                              <template v-if="editingMessageId === entry.msg.documentId">
                                <div class="ik-knock__edit-row">
                                  <input
                                    v-model="editingDraft"
                                    class="ik-knock__edit-input"
                                    maxlength="4000"
                                    @keydown.enter.prevent="submitEdit"
                                    @keydown.escape.prevent="cancelEdit"
                                  />
                                  <button class="ik-knock__edit-save" @click="submitEdit">保存</button>
                                  <button class="ik-knock__edit-cancel" @click="cancelEdit">取消</button>
                                </div>
                              </template>
                              <template v-else>
                                {{ entry.msg.content }}
                                <span v-if="entry.msg.editedAt" class="ik-knock__msg-edited">(已编辑)</span>
                              </template>
                            </template>
                          </template>
                          <!-- 通知消息 -->
                          <template v-else-if="entry.msg.kind === 'notification'">
                            <div class="ik-knock__notif-body">
                              <span class="ik-knock__notif-text">{{ entry.msg.content }}</span>
                              <button
                                v-if="entry.msg.article"
                                class="ik-knock__notif-quote"
                                @click="goPost(entry.msg)"
                              >
                                <DocumentTextIcon class="ik-knock__notif-quote-icon" />
                                <span class="ik-knock__notif-quote-label">
                                  {{ entry.msg.notificationKind === 'like' ? '帖子' : '评论帖子' }}
                                </span>
                                <span class="ik-knock__notif-quote-title">
                                  {{ entry.msg.comment?.content || entry.msg.article?.title || '' }}
                                </span>
                              </button>
                            </div>
                          </template>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
                <div v-else-if="!activeMessageLoading" class="ik-knock__empty-pill">EMPTY</div>

                <div v-if="activeConversation" class="ik-knock__composer">
                  <div v-if="editingMessageId" class="ik-knock__composer-edit-banner">
                    正在编辑消息
                    <button class="ik-knock__edit-cancel-link" @click="cancelEdit">取消</button>
                  </div>
                  <div v-if="sendError" class="ik-knock__composer-error" role="alert">{{ sendError }}</div>
                  <div class="ik-knock__composer-row" :class="{ 'is-disabled': composerDisabled }">
                    <textarea
                      ref="composerRef"
                      v-model="composerValue"
                      class="ik-knock__composer-input"
                      :placeholder="composerPlaceholder"
                      rows="1"
                      maxlength="4000"
                      :disabled="composerDisabled"
                      @input="onComposerInput"
                      @keydown="editingMessageId ? undefined : onComposerKeyDown($event)"
                    />
                    <button
                      v-if="editingMessageId"
                      type="button"
                      class="ik-knock__composer-send"
                      :disabled="!editingDraft.trim()"
                      @click="submitEdit"
                    >
                      <PaperAirplaneIcon class="ik-knock__composer-send-icon" />
                    </button>
                    <button
                      v-else
                      type="button"
                      class="ik-knock__composer-send"
                      :disabled="composerDisabled || !draft.trim() || sendBusy"
                      aria-label="发送"
                      @click="doSend"
                    >
                      <PaperAirplaneIcon class="ik-knock__composer-send-icon" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </template>
          <template v-else-if="activeTab === 'contacts'">
            <section class="ik-knock__main">
              <div class="ik-knock__empty-pill">EMPTY</div>
            </section>
          </template>
          <template v-else-if="activeTab === 'calls'">
            <section class="ik-knock__main">
              <div class="ik-knock__empty-pill">EMPTY</div>
            </section>
          </template>
          <template v-else>
            <section class="ik-knock__main">
              <div class="ik-knock__empty-pill">暂未开放</div>
            </section>
          </template>
          </div>
        </div>

        <!-- 右键菜单 -->
        <Teleport to="body">
          <div
            v-if="contextTargetMsg"
            ref="contextMenuRef"
            class="ik-knock__context-menu"
            :style="contextMenuStyle"
            @click.stop
          >
            <button class="ik-knock__context-item" @click="startEditMessage">编辑</button>
            <button class="ik-knock__context-item ik-knock__context-item--danger" @click="doWithdraw">撤回</button>
          </div>
        </Teleport>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Overlay / Dialog ── */
.ik-overlay {
  position: fixed;
  inset: 0;
  z-index: 8900;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ik-dialog--knock {
  width: clamp(780px, 90vw, 1100px);
  height: clamp(520px, 82vh, 780px);
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  overflow: hidden;
  background: #121212;
  border: 2px solid #2D2C2D;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.65), inset 0 0 0 4px #000;
}

/* ── Header Bar ── */
.ik-knock__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  flex-shrink: 0;
  border-radius: 22px 22px 0 0;
  background:
    url("/images/tab-bg-point.webp") repeat,
    linear-gradient(180deg, #161616 0%, #080808 100%);
}

.ik-knock__brand {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.ik-knock__brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.ik-knock__brand-icon > svg {
  width: 100%;
  height: 100%;
}

.ik-knock__brand-text {
  font-size: 26px;
  font-weight: 800;
  font-style: normal;
  color: #fff;
  letter-spacing: -0.4px;
  line-height: 1;
}

.ik-dialog__close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: opacity 140ms ease, transform 140ms ease;
}

.ik-dialog__close:hover {
  opacity: 0.85;
  transform: scale(1.08);
}

.ik-dialog__close:active {
  transform: scale(0.95);
}

.ik-dialog__close-img {
  height: 32px;
  width: auto;
  display: block;
}

/* ── Body ── */
.ik-knock__body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 18px;
  padding: 20px 24px 24px;
}

/* ── Sidebar ── */
.ik-knock__sidebar {
  width: 320px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: #0a0a0a;
  border-right: 2px solid #202020;
}

.ik-knock__tabs {
  display: flex;
  border-bottom: 2px solid #202020;
  flex-shrink: 0;
}

.ik-knock__tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: color 140ms ease, background 140ms ease;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}

.ik-knock__tab:hover { color: rgba(255, 255, 255, 0.75); }
.ik-knock__tab.is-active { color: #fbfe00; border-bottom-color: #fbfe00; }
.ik-knock__tab.is-disabled { opacity: 0.35; cursor: not-allowed; }
.ik-knock__tab-icon { width: 16px; height: 16px; }

/* ── List ── */
.ik-knock__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.18) transparent;
}

.ik-knock__list::-webkit-scrollbar { width: 4px; }
.ik-knock__list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 2px; }

.ik-knock__list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  border-radius: 999px;
  background-color: transparent;
  background-image:
    linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 0 75%, rgba(255,255,255,0.06) 0),
    linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 0 75%, rgba(255,255,255,0.06) 0);
  background-position: 0 0, 3px 3px;
  background-size: 6px 6px;
  background-repeat: repeat;
  box-shadow: inset 0 0 0 1px #000, inset 0 0 0 5px #3a3a3a;
  color: #888;
  text-align: left;
  cursor: pointer;
  transition: background-color 140ms ease, box-shadow 140ms ease, color 140ms ease;
}

.ik-knock__list-item:hover {
  background-color: rgba(255,255,255,0.04);
  box-shadow: inset 0 0 0 1px #000, inset 0 0 0 5px rgba(255,255,255,0.35);
}

.ik-knock__list-item.is-active {
  background-color: #fbfe00;
  background-image: none;
  box-shadow: none;
  color: #000;
}

.ik-knock__list-item.is-active .ik-knock__item-title,
.ik-knock__list-item.is-active .ik-knock__item-subtitle,
.ik-knock__list-item.is-active .ik-knock__item-time { color: #000; }

.ik-knock__avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 3px solid #000;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.ik-knock__avatar-img { width: 100%; height: 100%; object-fit: cover; user-select: none; -webkit-user-drag: none; }

.ik-knock__item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; line-height: 1.2; }
.ik-knock__item-title { font-size: 16px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ik-knock__item-subtitle { font-size: 13px; font-weight: 700; color: #5a5a5a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ik-knock__item-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #ff4d4f;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ik-knock__item-time { flex-shrink: 0; font-size: 11px; color: rgba(255,255,255,0.3); font-weight: 600; }

.ik-knock__list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
  color: rgba(255,255,255,0.4);
  font-size: 13px;
}

/* ── Main ── */
.ik-knock__main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%);
  border-radius: 12px;
  box-shadow: 0 5px 8px rgba(0,0,0,0.85);
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.ik-knock__main-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 58px;
  padding: 0 18px;
  border-bottom: 3px solid #202020;
}

.ik-knock__main-icon { width: 22px; height: 22px; color: #454545; flex-shrink: 0; }

.ik-knock__main-title-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }

.ik-knock__main-title { font-size: 17px; font-weight: 900; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ik-knock__typing-hint { font-size: 11px; color: #fbfe00; font-weight: 600; }

.ik-knock__main-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px;
  overflow: hidden;
}

.ik-knock__empty-pill {
  margin: auto;
  padding: 16px 88px;
  min-width: 360px;
  text-align: center;
  border-radius: 999px;
  background: rgba(0,0,0,0.55);
  color: rgba(255,255,255,0.32);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 6px;
  user-select: none;
}

/* ── Messages ── */
.ik-knock__messages {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 6px;
  padding-bottom: 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.18) transparent;
  overscroll-behavior: contain;
  overflow-anchor: none;
}

.ik-knock__messages.is-settling { visibility: hidden; }
.ik-knock__messages::-webkit-scrollbar { width: 4px; }
.ik-knock__messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 2px; }

.ik-knock__msg { display: flex; gap: 10px; align-items: flex-start; }

.ik-knock__msg-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.05);
  color: #4a4a4a;
  overflow: hidden;
}

.ik-knock__msg-avatar-img { width: 100%; height: 100%; object-fit: cover; user-select: none; -webkit-user-drag: none; }

.ik-knock__msg-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; max-width: min(560px, 92%); }

.ik-knock__time-divider {
  align-self: center;
  margin: 6px 0 2px;
  padding: 2px 10px;
  color: rgba(255,255,255,0.32);
  font-size: 12px;
  letter-spacing: 0.5px;
  user-select: none;
}

.ik-knock__msg-bubble {
  position: relative;
  align-self: flex-start;
  max-width: 100%;
  padding: 6px 14px;
  background: #ffffff;
  border-radius: 16px;
  color: #4d4d4d;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
  white-space: pre-wrap;
}

.ik-knock__msg-bubble::before {
  content: "";
  position: absolute;
  top: 0.125em;
  left: -0.4375em;
  width: 0.75em;
  height: 0.75em;
  border-left: 0.45em solid #ffffff;
  border-top: 0.35em solid transparent;
  border-bottom: 0.35em solid transparent;
  background: none;
}

.ik-knock__msg.is-mine { flex-direction: row-reverse; }
.ik-knock__msg.is-mine .ik-knock__msg-body { align-items: flex-end; }
.ik-knock__msg.is-mine .ik-knock__msg-bubble { align-self: flex-end; background: #2c58e2; color: #fff; }
.ik-knock__msg.is-mine .ik-knock__msg-bubble::before {
  left: auto;
  right: -0.4375em;
  border-left: none;
  border-right: 0.45em solid #2c58e2;
  border-top: 0.35em solid transparent;
  border-bottom: 0.35em solid transparent;
}

.ik-knock__msg-bubble.is-notification { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.08); }
.ik-knock__msg-bubble.is-notification::before { display: none; }

.ik-knock__msg-deleted { color: rgba(255,255,255,0.3); font-style: italic; font-weight: 500; font-size: 14px; }
.ik-knock__msg-edited { color: rgba(255,255,255,0.3); font-size: 11px; margin-left: 4px; }

.ik-knock__notif-body { display: flex; flex-direction: column; gap: 6px; }
.ik-knock__notif-text { font-size: 14px; }
.ik-knock__notif-quote {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  background: rgba(255,255,255,0.04);
  cursor: pointer;
  border: 0;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  text-align: left;
  transition: background 140ms ease;
}
.ik-knock__notif-quote:hover { background: rgba(255,255,255,0.08); }
.ik-knock__notif-quote-icon { width: 14px; height: 14px; flex-shrink: 0; color: rgba(255,255,255,0.5); }
.ik-knock__notif-quote-label { font-size: 11px; color: rgba(255,255,255,0.45); font-weight: 700; flex-shrink: 0; }
.ik-knock__notif-quote-title { font-size: 12px; color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Composer ── */
.ik-knock__composer {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 10px;
  border-top: 2px solid rgba(255,255,255,0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ik-knock__composer-edit-banner { font-size: 12px; color: #fbfe00; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.ik-knock__edit-cancel-link { border: 0; background: transparent; color: rgba(255,255,255,0.5); cursor: pointer; font-size: 12px; }
.ik-knock__edit-cancel-link:hover { color: #fff; }

.ik-knock__composer-error {
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(255,80,80,0.15);
  color: #ff8080;
  font-size: 12px;
  font-weight: 600;
}

.ik-knock__composer-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px;
  background: rgba(255,255,255,0.04);
  border-radius: 14px;
  border: 2px solid rgba(255,255,255,0.08);
  transition: border-color 140ms ease;
}

.ik-knock__composer-row:focus-within { border-color: rgba(251,254,0,0.5); }
.ik-knock__composer-row.is-disabled { background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.05); cursor: not-allowed; }
.ik-knock__composer-row.is-disabled .ik-knock__composer-input { cursor: not-allowed; color: rgba(255,255,255,0.35); }

.ik-knock__composer-input {
  flex: 1;
  min-height: 36px;
  max-height: 140px;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.45;
  resize: none;
  outline: none;
}

.ik-knock__composer-input::placeholder { color: rgba(255,255,255,0.32); }

.ik-knock__composer-send {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: #fbfe00;
  color: #000;
  cursor: pointer;
  transition: background 140ms ease, transform 100ms ease, opacity 140ms ease;
}

.ik-knock__composer-send:hover:not(:disabled) { background: #e8eb00; }
.ik-knock__composer-send:active:not(:disabled) { transform: scale(0.94); }
.ik-knock__composer-send:disabled { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.3); cursor: not-allowed; }
.ik-knock__composer-send-icon { width: 18px; height: 18px; }

/* ── Edit row ── */
.ik-knock__edit-row { display: flex; gap: 6px; align-items: center; }
.ik-knock__edit-input { flex: 1; padding: 4px 8px; border: 1px solid rgba(0,0,0,0.15); border-radius: 6px; font-size: 14px; font-family: inherit; outline: none; background: #fff; color: #333; }
.ik-knock__edit-save, .ik-knock__edit-cancel { padding: 4px 10px; border: 0; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; }
.ik-knock__edit-save { background: #fbfe00; color: #000; }
.ik-knock__edit-cancel { background: transparent; color: rgba(0,0,0,0.4); }

/* ── Context Menu ── */
.ik-knock__context-menu {
  position: fixed;
  min-width: 120px;
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.6);
  overflow: hidden;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ik-knock__context-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: 0;
  background: transparent;
  color: rgba(255,255,255,0.8);
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  transition: background 140ms ease;
}

.ik-knock__context-item:hover { background: rgba(255,255,255,0.08); }
.ik-knock__context-item--danger { color: #ff6b6b; }
.ik-knock__context-item--danger:hover { background: rgba(255,80,80,0.15); }

/* ── Animations ── */
.ik-overlay-enter-active { transition: opacity 200ms ease-out; }
.ik-overlay-leave-active { transition: opacity 150ms ease-in; }
.ik-overlay-enter-from, .ik-overlay-leave-to { opacity: 0; }

@keyframes ik-msg-enter { from { opacity: 0; transform: translateY(8px); } }
.ik-knock__msg.is-new, .ik-knock__time-divider.is-new { animation: ik-msg-enter 300ms ease-out both; }

@media (prefers-reduced-motion: reduce) {
  .ik-knock__msg.is-new, .ik-knock__time-divider.is-new { animation: none; }
}

@media (max-width: 900px) {
  .ik-dialog--knock { width: 96vw; height: 88vh; }
  .ik-knock__sidebar { width: 260px; min-width: 240px; }
}

@media (max-width: 768px) {
  .ik-dialog--knock { flex-direction: column; width: 100vw; height: 100dvh; border-radius: 0; }
  .ik-knock__sidebar { width: 100%; min-width: 0; height: 50%; border-right: 0; border-bottom: 2px solid #202020; }
  .ik-knock__main-header { height: 50px; padding: 0 14px; }
  .ik-knock__main-body { padding: 14px; }
  .ik-knock__main-title { font-size: 16px; }
  .ik-knock__empty-pill { padding: 12px 64px; min-width: 280px; font-size: 16px; letter-spacing: 4px; }
}
</style>
