<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { useMessage } from 'zenless-ui'
import { useAuthStore } from '@/stores/auth'
import { useLoginDialog } from '@/composables/useLoginDialog'
import { useKnockKnockModal } from '@/composables/useKnockKnockModal'
import { useDmConversations } from '@/composables/useDmConversations'
import { usePageDataLoading } from '@/composables/usePageDataLoading'
import { pickFirstQuery } from '@/utils/query'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const loginDialog = useLoginDialog()
const knockKnockModal = useKnockKnockModal()
const { totalUnread } = useDmConversations()
const message = useMessage()

type TabName = 'home' | 'notification' | 'create' | 'mine'
const activeTab = ref<TabName>('home')
const searchKeyword = ref('')
const applyingSearch = ref(false)
const searchInputRef = ref<any>(null)

const mineTabText = computed(() => {
  const label = auth.user?.name
  if (!label) return '我的'
  return label.length > 3 ? `${label.slice(0, 4)}...` : label
})

function resolveTab(path: string): TabName {
  if (path.startsWith('/profile')) return 'mine'
  if (path.startsWith('/create')) return 'create'
  return 'home'
}

async function applySearch() {
  if (applyingSearch.value) return
  const keyword = searchKeyword.value.trim()
  const currentQ = pickFirstQuery(route.query.q as string | string[] | undefined).trim()
  if (route.path === '/' && keyword === currentQ) return
  applyingSearch.value = true
  if (route.path === '/') {
    try { await router.replace({ path: '/', query: keyword ? { q: keyword } : {} }) }
    finally { applyingSearch.value = false }
    return
  }
  try { await router.push({ path: '/', query: keyword ? { q: keyword } : {} }) }
  finally { applyingSearch.value = false }
}

async function handleTabChange(next: string) {
  const tab = next as TabName
  if (tab === 'home') { await router.push('/'); return }
  if (tab === 'notification') { knockKnockModal.open(); activeTab.value = resolveTab(route.path); return }
  if (tab === 'create') {
    if (!auth.isLogin) { loginDialog.open(); activeTab.value = resolveTab(route.path); return }
    await router.push('/create'); return
  }
  if (auth.profilePath) await router.push(auth.profilePath)
  else loginDialog.open()
}

watch(() => route.fullPath, () => {
  activeTab.value = resolveTab(route.path)
  searchKeyword.value = pickFirstQuery(route.query.q as string | string[] | undefined)
}, { immediate: true })

// Mobile scroll hide
const isHeaderHidden = ref(false)
let lastScrollY = 0
const SCROLL_BUFFER = 80
const SCROLL_DELTA = 6

import { useEventListener } from '@vueuse/core'
useEventListener(window, 'scroll', () => {
  const y = window.scrollY
  const delta = y - lastScrollY
  if (y <= SCROLL_BUFFER) isHeaderHidden.value = false
  else if (delta > SCROLL_DELTA) isHeaderHidden.value = true
  else if (delta < -SCROLL_DELTA) isHeaderHidden.value = false
  lastScrollY = y
}, { passive: true })

// Page progress
const { isActive, progress, start, finish } = usePageDataLoading()
let autoTimer: ReturnType<typeof setTimeout> | null = null
router.beforeEach((_to, _from) => { if (_to.path !== _from.path) { if (autoTimer) clearTimeout(autoTimer); start() } })
router.afterEach(() => { autoTimer = setTimeout(() => { finish() }, 100) })
</script>

<template>
  <header class="ik-header" :class="{ 'is-hidden': isHeaderHidden }">
    <div class="ik-header__inner">
      <div class="ik-header__left">
        <router-link to="/" class="ik-brand">
          <img src="/images/zzzicon.png" alt="绳网" class="ik-brand__icon" draggable="false" />
          <strong class="ik-brand__title">INTER-KNOT</strong>
        </router-link>
      </div>
      <div class="ik-header__middle">
        <div class="ik-search-shell">
          <z-input
            ref="searchInputRef"
            v-model="searchKeyword"
            class="ik-search-input"
            placeholder="全站搜索"
            @keydown.enter.prevent="applySearch"
          >
            <template #suffix>
              <span v-if="searchKeyword" class="ik-search-clear" @mousedown.prevent="searchKeyword = ''">
                <i class="z-icon-error" />
              </span>
              <span class="ik-search-divider" />
              <button type="button" class="ik-search-action" @click="applySearch">
                <i class="z-icon-search" />
              </button>
            </template>
          </z-input>
        </div>
      </div>
      <div class="ik-header__right">
        <div class="ik-header-tabs">
          <button :class="['ik-header-tab', 'ik-header-tab--first', { 'is-active': activeTab === 'home' }]" @click="handleTabChange('home')">
            <svg class="ik-tab-highlight ik-tab-highlight--first" viewBox="0 0 110.7 42"><path d="M 21 0 L 94.38 0 A 10 10 0 0 1 103.29 14.54 L 93.75 33.26 A 16 16 0 0 1 79.5 42 L 21 42 A 21 21 0 0 1 21 0 Z" fill="currentColor"/></svg>
            <span class="ik-header-tab__content">推荐</span>
          </button>
          <button :class="['ik-header-tab', 'ik-header-tab--middle', { 'is-active': activeTab === 'notification' }]" @click="handleTabChange('notification')">
            <svg class="ik-tab-highlight ik-tab-highlight--middle" viewBox="0 0 121.4 42"><path d="M 105.08 0 A 10 10 0 0 1 113.99 14.54 L 104.45 33.26 A 16 16 0 0 1 90.2 42 L 16.32 42 A 10 10 0 0 1 7.41 27.46 L 16.95 8.74 A 16 16 0 0 1 31.2 0 Z" fill="currentColor"/></svg>
            <span class="ik-header-tab__content">
              <span class="ik-tab-label">敲敲</span>
              <span v-if="totalUnread > 0" class="ik-tab-badge">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
              <span v-else class="ik-tab-dot" />
            </span>
          </button>
          <button :class="['ik-header-tab', 'ik-header-tab--middle', { 'is-active': activeTab === 'create' }]" @click="handleTabChange('create')">
            <svg class="ik-tab-highlight ik-tab-highlight--middle" viewBox="0 0 121.4 42"><path d="M 105.08 0 A 10 10 0 0 1 113.99 14.54 L 104.45 33.26 A 16 16 0 0 1 90.2 42 L 16.32 42 A 10 10 0 0 1 7.41 27.46 L 16.95 8.74 A 16 16 0 0 1 31.2 0 Z" fill="currentColor"/></svg>
            <span class="ik-header-tab__content">发帖</span>
          </button>
          <button :class="['ik-header-tab', 'ik-header-tab--last', { 'is-active': activeTab === 'mine' }]" @click="handleTabChange('mine')">
            <svg class="ik-tab-highlight ik-tab-highlight--last" viewBox="0 0 110.7 42"><path d="M 89.7 0 A 21 21 0 0 1 89.7 42 L 13.05 42 A 8 8 0 0 1 5.93 30.37 L 16.95 8.74 A 16 16 0 0 1 31.2 0 Z" fill="currentColor"/></svg>
            <span class="ik-header-tab__content">{{ mineTabText }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="ik-header__progress" :class="{ 'is-active': isActive }">
      <div class="ik-header__progress-bar" :style="{ width: `${progress}%` }" />
    </div>
  </header>
</template>

<style scoped>
.ik-header { position: sticky; top: 0; z-index: 50; background: #000; transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1); }
@media (max-width: 768px) { .ik-header.is-hidden { transform: translateY(-100%); } }
.ik-header__progress { position: absolute; left: 0; bottom: 0; width: 100%; height: 3px; overflow: hidden; pointer-events: none; opacity: 0; transition: opacity 0.3s ease; }
.ik-header__progress.is-active { opacity: 1; }
.ik-header__progress-bar { height: 100%; background: #fbfe00; box-shadow: 0 0 8px rgba(251, 254, 0, 0.6); transition: width 0.2s ease; }
.ik-header__inner { min-height: 78px; display: flex; align-items: center; gap: 10px; padding: 8px 32px; }
.ik-header__left { flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; justify-content: flex-start; }
.ik-brand { display: inline-flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.ik-brand__icon { width: 46px; height: 46px; object-fit: contain; user-select: none; -webkit-user-drag: none; pointer-events: none; }
.ik-brand__title { color: #fff; font-size: 24px; line-height: 1; letter-spacing: -0.9px; font-weight: 900; }
.ik-header__middle { flex: 1 1 auto; min-width: 0; display: flex; justify-content: center; align-items: center; }
.ik-search-shell { width: clamp(400px, 30vw, 540px); max-width: 100%; min-width: 240px; display: flex; align-items: center; }
.ik-header__right { flex: 1 1 0; min-width: 0; display: inline-flex; justify-content: flex-end; align-items: center; }
.ik-search-input { flex: 1; min-width: 0; }
.ik-search-input :deep(.z-input) { border: 1px solid rgba(255, 255, 255, 0.1); background: #1e1e1e; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.ik-search-input :deep(.z-input::after) { display: none; }
.ik-search-input :deep(.z-input.is-focused) { border-color: rgba(215, 255, 0, 0.55); box-shadow: 0 0 0 2px rgba(215, 255, 0, 0.12); }
.ik-search-input :deep(.z-input__inner) { height: 44px; padding: 0 16px; color: #e0e0e0; }
.ik-search-input :deep(.z-input__inner::placeholder) { color: #808080; }
.ik-search-input :deep(.z-input__suffix) { display: flex; align-items: center; gap: 0; padding-right: 6px; }
.ik-search-clear { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; color: #666; font-size: 14px; cursor: pointer; border-radius: 50%; transition: color 0.15s ease, background 0.15s ease; }
.ik-search-clear:hover { color: #ccc; background: rgba(255, 255, 255, 0.06); }
.ik-search-divider { width: 1px; height: 20px; background: rgba(255, 255, 255, 0.12); margin: 0 4px; flex-shrink: 0; }
.ik-search-action { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: #a0a0a0; font-size: 18px; cursor: pointer; padding: 0; appearance: none; transition: color 0.15s ease, background 0.15s ease; }
.ik-search-action:hover { background: rgba(215, 255, 0, 0.15); color: #fbfe00; }
.ik-search-action:active { background: rgba(215, 255, 0, 0.25); color: #fbfe00; }
.ik-header-tabs { position: relative; display: flex; overflow: visible; border: 3px solid #313131; border-radius: 999px; background: #050505 url("/images/tab-bg-point.webp") repeat; }
.ik-header-tab { position: relative; z-index: 0; width: 100px; height: 42px; padding: 0; overflow: visible; border: 0; appearance: none; background: transparent; color: #fff; cursor: pointer; font-family: inherit; font-size: 18px; font-weight: 700; font-style: italic; line-height: 1; text-align: center; user-select: none; transition: color 140ms ease; }
.ik-header-tab.is-active { color: #000; }
.ik-header-tab__content { position: relative; z-index: 2; display: inline-flex; align-items: center; justify-content: center; height: 100%; }
.ik-tab-highlight { position: absolute; top: 0; z-index: 1; height: 42px; color: #fbfe00; opacity: 0; pointer-events: none; transform: scale(1.1); transform-origin: center; }
.ik-tab-highlight--first { left: 0; width: 110.7px; }
.ik-tab-highlight--middle { left: -10.7px; width: 121.4px; }
.ik-tab-highlight--last { right: 0; width: 110.7px; }
.ik-header-tab.is-active .ik-tab-highlight { opacity: 1; animation: ik-tab-color 800ms linear infinite alternate, ik-tab-scale 700ms linear infinite; }
@keyframes ik-tab-color { from { color: #fbfe00; } to { color: #dcfe00; } }
@keyframes ik-tab-scale { 0% { transform: scale(1.1); } 50% { transform: scale(1.25); } 100% { transform: scale(1.1); } }
.ik-tab-dot { width: 6px; height: 6px; border-radius: 50%; background: #ff4d4f; }
.ik-tab-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ff4d4f;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  font-style: normal;
  line-height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
@media (max-width: 1180px) { .ik-brand__title { font-size: 20px; } .ik-search-shell { width: clamp(280px, 28vw, 420px); } }
@media (max-width: 1100px) { .ik-header-tabs { display: none; } .ik-header__middle { flex: 1 1 0; } .ik-search-shell { max-width: 100%; } }
@media (max-width: 768px) { .ik-header__inner { min-height: 66px; padding: 6px 16px; gap: 8px; } .ik-brand__icon { width: 38px; height: 38px; } .ik-brand__title { display: none; } .ik-search-shell { max-width: 100%; min-width: 0; } }
</style>
