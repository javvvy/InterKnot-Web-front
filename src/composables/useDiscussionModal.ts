import { ref, shallowRef } from 'vue'

const isOpen = ref(false)
const discussionId = shallowRef<string | null>(null)
const coverHint = shallowRef<number | null>(null)
const title = ref('')

export function useDiscussionModal() {
  function open(id: string, opts?: { coverAspectRatio?: number | null }) {
    discussionId.value = id
    coverHint.value = opts?.coverAspectRatio ?? null
    isOpen.value = true
    document.body.style.overflow = 'hidden'
    history.pushState({ modal: 'discussion', id }, '', `/discussion/${id}`)
  }

  function close() {
    isOpen.value = false
    if (history.state?.modal === 'discussion') {
      history.back()
    }
  }

  function teardown() {
    document.body.style.overflow = ''
    isOpen.value = false
    discussionId.value = null
  }

  function clearAfterLeave() {
    document.body.style.overflow = ''
    discussionId.value = null
  }

  function setTitle(t: string) {
    title.value = t
    document.title = t ? `${t} - 绳网` : '绳网'
  }

  function handlePopState() {
    if (isOpen.value) {
      teardown()
    }
  }

  return { isOpen, discussionId, coverHint, title, open, close, teardown, clearAfterLeave, setTitle, handlePopState }
}
