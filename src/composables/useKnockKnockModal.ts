/**
 * useKnockKnockModal —— "敲敲" 消息通知弹窗状态管理
 *
 * 模式：单例弹窗，通过 history.pushState 改变 URL（不走 Vue Router）。
 * open() 通过 history.pushState 改变 URL，
 * tab 切换 / 选中会话时通过 history.replaceState 更新 URL，
 * close() 通过 history.back() 回退。
 */

import { ref } from "vue"
import { useBodyScrollLock } from "./useBodyScrollLock"

const knockKnockVisible = ref(false)
const pendingDmConversationId = ref<string | null>(null)
const pendingKkCallSessionId = ref<string | null>(null)
const SCROLL_LOCK_TOKEN = Symbol("knock-knock-modal")

let _historyPushed = false
let _savedTitle = ""
const DEFAULT_TITLE = "绳网"

interface OpenOptions {
  dmConversationId?: string
  kkCallSessionId?: string
}

export function useKnockKnockModal() {
  const { acquire, release } = useBodyScrollLock()

  const open = (options?: OpenOptions) => {
    if (typeof window === "undefined") return
    if (options?.kkCallSessionId) {
      pendingKkCallSessionId.value = options.kkCallSessionId
      pendingDmConversationId.value = null
    } else if (options?.dmConversationId) {
      pendingDmConversationId.value = options.dmConversationId
      pendingKkCallSessionId.value = null
    }
    knockKnockVisible.value = true
    _historyPushed = true
    _savedTitle = document.title
    acquire(SCROLL_LOCK_TOKEN)
    window.history.pushState({ __knockKnockModal: true }, "", "/knock")
    document.title = `敲敲 - ${DEFAULT_TITLE}`
  }

  const close = () => {
    if (!knockKnockVisible.value) return
    teardown()
    if (_historyPushed) {
      _historyPushed = false
      window.history.back()
    }
  }

  function teardown() {
    knockKnockVisible.value = false
    release(SCROLL_LOCK_TOKEN)
    pendingDmConversationId.value = null
    pendingKkCallSessionId.value = null
    if (typeof window !== "undefined") {
      document.title = _savedTitle || DEFAULT_TITLE
    }
  }

  function handlePopState() {
    if (knockKnockVisible.value) {
      if (window.history.state?.__knockKnockModal) return
      _historyPushed = false
      teardown()
    }
  }

  function updateUrl(tab: string, conversationId?: string | null) {
    if (typeof window === "undefined" || !knockKnockVisible.value) return
    let url = "/knock"
    const params = new URLSearchParams()
    if (tab && tab !== "contacts") params.set("tab", tab)
    if (conversationId) params.set("c", conversationId)
    const qs = params.toString()
    if (qs) url += `?${qs}`
    window.history.replaceState({ __knockKnockModal: true }, "", url)
  }

  const consumePendingDmConversationId = (): string | null => {
    const next = pendingDmConversationId.value
    pendingDmConversationId.value = null
    return next
  }

  const consumePendingKkCallSessionId = (): string | null => {
    const next = pendingKkCallSessionId.value
    pendingKkCallSessionId.value = null
    return next
  }

  return {
    visible: knockKnockVisible,
    pendingDmConversationId,
    open,
    close,
    handlePopState,
    teardown,
    updateUrl,
    consumePendingDmConversationId,
    consumePendingKkCallSessionId,
  }
}
