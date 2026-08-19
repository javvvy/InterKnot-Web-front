<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLoginDialog } from '@/composables/useLoginDialog'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const loginDialog = useLoginDialog()

const activeTab = computed(() => {
  if (route.path === '/') return 'home'
  if (route.path.startsWith('/profile')) return 'mine'
  return ''
})

let lastTapTime = 0

function goHome() {
  if (activeTab.value === 'home') {
    const now = Date.now()
    if (now - lastTapTime < 300) { window.dispatchEvent(new CustomEvent('ik:home-refresh')) }
    lastTapTime = now
    return
  }
  router.push('/')
}

function goCreate() {
  if (!auth.isLogin) { loginDialog.open(); return }
  router.push('/create')
}

function goProfile() {
  if (auth.profilePath) router.push(auth.profilePath)
  else loginDialog.open()
}
</script>

<template>
  <nav class="ik-mobile-nav">
    <button class="ik-mobile-nav__item" :class="{ 'is-active': activeTab === 'home' }" @click="goHome">
      <div class="ik-mobile-nav__inner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-mobile-nav__icon"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>推送</span>
      </div>
    </button>
    <button class="ik-mobile-nav__create" @click="goCreate">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <button class="ik-mobile-nav__item" :class="{ 'is-active': activeTab === 'mine' }" @click="goProfile">
      <div class="ik-mobile-nav__inner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-mobile-nav__icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>我的</span>
      </div>
    </button>
  </nav>
</template>

<style scoped>
.ik-mobile-nav { display: none; }
@media (max-width: 1100px) {
  .ik-mobile-nav { position: fixed; bottom: 0; left: 0; right: 0; z-index: 40; height: calc(58px + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); background: #1A1A1A; border-top: 1px solid rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: space-around; }
  .ik-mobile-nav__item { flex: 1; display: flex; align-items: center; justify-content: center; height: 58px; background: none; border: none; color: #9a9a9a; cursor: pointer; padding: 0; transition: color 160ms; }
  .ik-mobile-nav__item.is-active { color: #fbfe00; }
  .ik-mobile-nav__inner { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 11px; font-weight: 700; transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  .ik-mobile-nav__item.is-active .ik-mobile-nav__inner { transform: scale(1.2); }
  .ik-mobile-nav__icon { width: 22px; height: 22px; }
  .ik-mobile-nav__create { width: 44px; height: 44px; border-radius: 50%; background: #fbfe00; border: none; color: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; animation: ik-create-pulse 1.5s ease-in-out infinite alternate; }
  .ik-mobile-nav__create svg { width: 24px; height: 24px; }
}
@keyframes ik-create-pulse { from { background: #fbfe00; } to { background: #dcfe00; } }
@media (prefers-reduced-motion: reduce) { .ik-mobile-nav__create { animation: none; } .ik-mobile-nav__inner { transition: none; } }
</style>
