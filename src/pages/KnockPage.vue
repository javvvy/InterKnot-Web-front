<script setup lang="ts">
/**
 * KnockPage —— /knock 直接访问入口
 *
 * URL 如 /knock?tab=calls&c=sessionId，本页负责解析参数、
 * 打开敲敲弹窗并定位到指定 tab / 会话。
 */
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import { useKnockKnockModal } from "@/composables/useKnockKnockModal"

const router = useRouter()
const modal = useKnockKnockModal()

onMounted(() => {
  const url = new URL(window.location.href)
  const tab = url.searchParams.get("tab") || undefined
  const conversationId = url.searchParams.get("c") || undefined

  const options: { dmConversationId?: string; kkCallSessionId?: string } = {}
  if (tab === "calls" && conversationId) {
    options.kkCallSessionId = conversationId
  } else if (conversationId) {
    options.dmConversationId = conversationId
  }

  // 清理 URL 回到根路径
  window.history.replaceState({}, "", "/")

  modal.close()
  setTimeout(() => {
    modal.open(options)
  }, 50)

  router.replace("/").catch(() => undefined)
})
</script>

<template>
  <div class="ik-page">
    <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
      <span style="color:rgba(255,255,255,0.3);font-size:14px;">正在打开敲敲…</span>
    </div>
  </div>
</template>
