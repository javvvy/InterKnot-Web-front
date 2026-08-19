<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue"
import { ChatBubbleLeftIcon, PaperAirplaneIcon } from "@heroicons/vue/24/solid"
import { useAuthStore } from "@/stores/auth"
import { useKkCall } from "@/composables/useKkCall"
import { formatTime } from "@/utils/time"
import type { KkCallSessionSummary } from "@/types/entities"

const props = defineProps<{
  sessionId: string | null
  sessions: KkCallSessionSummary[]
}>()

const emit = defineEmits<{
  (e: "session-materialized", realId: string): void
}>()

const { ensureMessages, messageStateOf, sendMessage, refresh, sessions: internalSessions } = useKkCall()
const auth = useAuthStore()

const myAvatar = computed<string>(() => auth.user?.avatar || "/images/default-avatar.webp")

const activeSession = computed<KkCallSessionSummary | null>(() => {
  const id = props.sessionId
  if (!id) return null
  // props.sessions（父组件传）优先，内部 sessions（migratePseudoToReal 已同步更新）兜底
  return props.sessions.find((s) => s.documentId === id)
    ?? internalSessions.value.find((s) => s.documentId === id)
    ?? null
})

const messageState = computed(() => {
  const id = props.sessionId
  if (!id) return null
  return messageStateOf(id)
})
const messages = computed(() => messageState.value?.items ?? [])
const messagesLoading = computed(() => !!messageState.value && messageState.value.loading && !messageState.value.hydrated)

const hasPendingAssistant = computed(() =>
  messages.value.some((m) => m.role === "assistant" && m.pending),
)

const TIME_GAP_MS = 5 * 60 * 1000
const knownMessageIds = ref(new Set<string>())

interface EnrichedMessage {
  msg: (typeof messages.value)[number]
  showTime: boolean
  isMine: boolean
  isNew: boolean
}
const enriched = computed<EnrichedMessage[]>(() => {
  const list = messages.value
  const known = knownMessageIds.value
  return list.map((msg, idx) => {
    let showTime = idx === 0
    if (!showTime && idx > 0) {
      const prev = list[idx - 1]
      if (prev) {
        const dCurr = new Date(msg.createdAt).getTime()
        const dPrev = new Date(prev.createdAt).getTime()
        if (!Number.isNaN(dCurr) && !Number.isNaN(dPrev)) showTime = dCurr - dPrev > TIME_GAP_MS
      }
    }
    return { msg, showTime, isMine: msg.role === "user", isNew: !known.has(msg.documentId) }
  })
})

const messagesRef = ref<HTMLElement | null>(null)
const messagesSettling = ref(false)
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

const onMessagesScroll = () => {
  const el = messagesRef.value
  if (!el) return
  wasNearBottom.value = isNearBottom(el)
}

watch(
  () => props.sessionId,
  async (id, oldId) => {
    if (!id) return
    // 切换会话时重置本地状态（伪→真实质化不是切换，不中断 SSE 流）
    if (oldId && oldId !== id && !(sending.value && oldId.startsWith("pseudo:"))) {
      draft.value = ""
      sendError.value = null
      sending.value = false
      if (currentSendAbort) {
        try { currentSendAbort() } catch { /* noop */ }
        currentSendAbort = null
      }
    }
    wasNearBottom.value = true
    messagesSettling.value = true
    try {
      await ensureMessages(id)
    } catch (err) {
      console.warn("[kk-call] load messages failed", err)
    }
    if (props.sessionId !== id) {
      messagesSettling.value = false
      return
    }
    knownMessageIds.value = new Set(messages.value.map((m) => m.documentId))
    nextTick(() => {
      const el = messagesRef.value
      if (!el) { messagesSettling.value = false; return }
      scrollToBottom(el)
      requestAnimationFrame(() => { messagesSettling.value = false })
    })
  },
  { immediate: true },
)

watch(
  () => messages.value.length,
  (next, prev) => {
    if (next <= (prev ?? 0)) return
    if (!wasNearBottom.value) return
    nextTick(() => {
      const el = messagesRef.value
      if (el) scrollToBottom(el)
    })
  },
)

watch(
  () => {
    const list = messages.value
    const last = list[list.length - 1]
    if (!last || last.role !== "assistant") return 0
    return last.content.length
  },
  () => {
    if (!wasNearBottom.value) return
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
)

const draft = ref("")
const sending = ref(false)
const sendError = ref<string | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
let currentSendAbort: (() => void) | null = null

const composerDisabled = computed(() => !props.sessionId || sending.value)

const placeholder = computed(() => {
  if (!props.sessionId) return "选择左侧角色开始通话"
  if (sending.value) return "等待回复中…"
  if (activeSession.value?.isPseudo) return `开启与 ${activeSession.value.character.name} 的对话`
  return `继续与 ${activeSession.value?.character.name ?? ""} 对话…`
})

const onComposerKeyDown = (e: KeyboardEvent) => {
  if (e.key !== "Enter") return
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  doSend()
}

const doSend = async () => {
  if (composerDisabled.value) return
  const text = draft.value.trim()
  if (!text) return
  const sid = props.sessionId
  if (!sid) return

  sendError.value = null
  sending.value = true
  draft.value = ""
  wasNearBottom.value = true

  const handle = sendMessage(sid, text)
  currentSendAbort = handle.abort

  handle.realId
    .then((realId) => { if (sid !== realId) emit("session-materialized", realId) })
    .catch(() => {})

  try {
    await handle.done
  } catch (err: any) {
    sendError.value = err?.message || "发送失败"
  } finally {
    sending.value = false
    currentSendAbort = null
    nextTick(() => { composerRef.value?.focus() })
  }
}

const retryLastUser = () => {
  if (sending.value) return
  const list = messages.value
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]!.role === "user") {
      draft.value = list[i]!.content
      doSend()
      return
    }
  }
}

onBeforeUnmount(() => {
  if (currentSendAbort) {
    try { currentSendAbort() } catch { /* noop */ }
    currentSendAbort = null
  }
})

if (typeof window !== "undefined" && props.sessions.length === 0) {
  void refresh()
}
</script>

<template>
  <section class="ik-knock__main ik-kkcall__main">
    <header class="ik-knock__main-header">
      <ChatBubbleLeftIcon class="ik-knock__main-icon" aria-hidden="true" />
      <div class="ik-knock__main-title-wrap">
        <span class="ik-knock__main-title">{{ activeSession?.character.name || "NoData" }}</span>
        <span v-if="activeSession?.character.tagline" class="ik-kkcall__main-subtitle">{{ activeSession.character.tagline }}</span>
      </div>
    </header>

    <div class="ik-knock__main-body">
      <div
        v-if="activeSession && messages.length"
        ref="messagesRef"
        class="ik-knock__messages"
        :class="{ 'is-settling': messagesSettling }"
        @scroll.passive="onMessagesScroll"
      >
        <template v-for="entry in enriched" :key="entry.msg.documentId">
          <div v-if="entry.showTime" class="ik-knock__time-divider" :class="{ 'is-new': entry.isNew }">
            {{ formatTime(entry.msg.createdAt) }}
          </div>
          <div class="ik-knock__msg" :class="{ 'is-new': entry.isNew, 'is-mine': entry.isMine }">
            <div class="ik-knock__msg-avatar" aria-hidden="true">
              <img v-if="entry.isMine" :src="myAvatar" alt="" class="ik-knock__msg-avatar-img" draggable="false" />
              <img v-else-if="activeSession.character.avatar" :src="activeSession.character.avatar" :alt="activeSession.character.name" class="ik-knock__msg-avatar-img" draggable="false" />
              <img v-else src="/images/default-avatar.webp" alt="" class="ik-knock__msg-avatar-img" draggable="false" />
            </div>
            <div class="ik-knock__msg-body">
              <div class="ik-knock__msg-bubble" :class="{ 'is-pending': entry.msg.pending, 'is-error': !!entry.msg.errorReason }">
                <template v-if="entry.msg.errorReason && !entry.msg.content">
                  <span class="ik-kkcall__msg-error">生成失败（{{ entry.msg.errorReason }}）</span>
                  <button type="button" class="ik-kkcall__msg-retry" :disabled="sending" @click="retryLastUser">重试</button>
                </template>
                <template v-else>
                  <span v-if="entry.msg.pending && !entry.msg.content" class="ik-kkcall__msg-dots" aria-label="正在输入">
                    <span class="ik-kkcall__msg-dot" /><span class="ik-kkcall__msg-dot" /><span class="ik-kkcall__msg-dot" />
                  </span>
                  <template v-else>
                    <span class="ik-kkcall__msg-content">{{ entry.msg.content }}</span>
                    <span v-if="entry.msg.pending" class="ik-kkcall__msg-cursor" aria-hidden="true">▋</span>
                  </template>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div v-else-if="!messagesLoading" class="ik-knock__empty-pill">EMPTY</div>

      <div v-if="activeSession" class="ik-knock__composer">
        <div v-if="sendError" class="ik-knock__composer-error" role="alert">{{ sendError }}</div>
        <div class="ik-knock__composer-row" :class="{ 'is-disabled': composerDisabled }">
          <textarea
            ref="composerRef"
            v-model="draft"
            class="ik-knock__composer-input"
            :placeholder="placeholder"
            rows="1"
            maxlength="4000"
            :disabled="composerDisabled"
            @keydown="onComposerKeyDown"
          />
          <button
            type="button"
            class="ik-knock__composer-send"
            :disabled="composerDisabled || !draft.trim()"
            aria-label="发送"
            @click="doSend"
          >
            <PaperAirplaneIcon class="ik-knock__composer-send-icon" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
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

.ik-knock__main-title-wrap { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; }

.ik-knock__main-title { font-size: 17px; font-weight: 900; color: #fff; }

.ik-knock__main-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 18px; overflow: hidden; }

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
.ik-knock__msg.is-mine .ik-knock__msg-bubble {
  align-self: flex-end;
  background: #2c58e2;
  color: #fff;
}
.ik-knock__msg.is-mine .ik-knock__msg-bubble::before {
  left: auto;
  right: -0.4375em;
  border-left: none;
  border-right: 0.45em solid #2c58e2;
  border-top: 0.35em solid transparent;
  border-bottom: 0.35em solid transparent;
  transform: none;
}

.ik-knock__composer {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 10px;
  border-top: 2px solid rgba(255,255,255,0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

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

/* KKCall 专属 */
.ik-kkcall__main-subtitle { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 2px; display: block; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ik-kkcall__msg-content { white-space: pre-wrap; word-break: break-word; }
.ik-kkcall__msg-cursor { display: inline-block; margin-left: 2px; animation: ik-kkcall-blink 0.9s steps(2, start) infinite; opacity: 0.6; }
@keyframes ik-kkcall-blink { to { opacity: 0; } }

@keyframes ik-msg-enter { from { opacity: 0; transform: translateY(8px); } }
.ik-knock__msg.is-new, .ik-knock__time-divider.is-new { animation: ik-msg-enter 300ms ease-out both; }

.ik-kkcall__msg-dots { display: inline-flex; align-items: center; gap: 4px; height: 1.4em; vertical-align: middle; }
.ik-kkcall__msg-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: rgba(77,77,77,0.55); animation: ik-kkcall-typing-bounce 1.2s ease-in-out infinite; }
.ik-kkcall__msg-dot:nth-child(2) { animation-delay: 0.2s; }
.ik-kkcall__msg-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes ik-kkcall-typing-bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.45; } 30% { transform: translateY(-3px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .ik-knock__msg.is-new, .ik-knock__time-divider.is-new { animation: none; }
  .ik-kkcall__msg-dot { animation: none; }
  .ik-kkcall__msg-cursor { animation: none; }
}

.ik-kkcall__msg-error { color: #ff8a80; font-size: 13px; }
.ik-kkcall__msg-retry { margin-left: 8px; font-size: 12px; background: transparent; color: #fbfe00; border: 1px solid currentColor; padding: 2px 8px; border-radius: 4px; cursor: pointer; }
.ik-kkcall__msg-retry:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 768px) {
  .ik-knock__main-header { height: 50px; padding: 0 14px; }
  .ik-knock__main-body { padding: 14px; }
  .ik-knock__main-title { font-size: 16px; }
  .ik-knock__empty-pill { padding: 12px 64px; min-width: 280px; font-size: 16px; letter-spacing: 4px; }
}
</style>
