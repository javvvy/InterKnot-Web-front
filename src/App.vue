<script setup lang="ts">
import { computed, onMounted, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDiscussionModal } from '@/composables/useDiscussionModal'
import { useKnockKnockModal } from '@/composables/useKnockKnockModal'
import AppHeader from '@/components/AppHeader.vue'
import MobileBottomNav from '@/components/MobileBottomNav.vue'
import LoginDialog from '@/components/LoginDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const discussionModal = useDiscussionModal()
const knockKnockModal = useKnockKnockModal()

onMounted(async () => {
  auth.hydrateFromStorage()

  // Handle SPA fallback path
  const url = new URL(window.location.href)
  const fallbackPath = url.searchParams.get('p')
  if (fallbackPath) {
    url.searchParams.delete('p')
    window.history.replaceState({}, '', url.toString())
    router.replace(decodeURIComponent(fallbackPath)).catch(() => undefined)
  }

  // Browser back/forward: close discussion overlay and knock knock modal
  window.addEventListener('popstate', () => {
    discussionModal.handlePopState()
    knockKnockModal.handlePopState()
  })

  // Close discussion overlay on route navigation
  router.beforeEach(() => {
    if (discussionModal.isOpen.value) discussionModal.teardown()
  })

  // ── Auth bridge for knock-knock real-time connections ──
  // Deferred to onMounted to avoid bloating the critical init path.
  // Dynamic imports prevent the heavy DM/knock modules from loading
  // until the initial page has already rendered.
  try {
    const [{ watch }, { useDmConversations }, { useKnockKnockConversations }] = await Promise.all([
      import('vue'),
      import('@/composables/useDmConversations'),
      import('@/composables/useKnockKnockConversations'),
    ])

    const dm = useDmConversations()
    const { reset: resetKnock } = useKnockKnockConversations()

    // Start DM connections on login
    watch(
      () => auth.isLogin,
      (loggedIn) => {
        if (!loggedIn) return
        dm.startStream()
        void dm.refresh()
      },
      { immediate: true },
    )

    // Clean up on logout
    window.addEventListener("auth:logout", () => {
      resetKnock()
      dm.reset()
    })
  } catch (e) {
    console.warn("[app] knock-knock auth bridge init failed, feature disabled:", e)
  }
})

const showMobileBottomNav = computed(() => !route.path.startsWith('/create'))

// Lazy-load KnockKnockModal: don't load any of its heavy deps
// (WebSocket, SSE, DM store, KKCall store) until first needed.
const KnockKnockModalLazy = defineAsyncComponent(
  () => import('@/components/KnockKnockModal.vue'),
)
</script>

<template>
  <div>
    <AppHeader />
    <main class="ik-page">
      <router-view />
    </main>
    <MobileBottomNav v-if="showMobileBottomNav" />
    <LoginDialog />
    <ConfirmDialog />
    <KnockKnockModalLazy />
  </div>
</template>
