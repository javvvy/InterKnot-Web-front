<script setup lang="ts">
import { ref, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { useLoginDialog } from '@/composables/useLoginDialog'
import { useKnockKnockModal } from '@/composables/useKnockKnockModal'
import { useDmConversations } from '@/composables/useDmConversations'
import type { Profile } from '@/types/entities'

const props = withDefaults(defineProps<{ authorId?: string; clickable?: boolean }>(), { clickable: false })

const router = useRouter()
const api = useApi()
const auth = useAuthStore()
const loginDialog = useLoginDialog()
const knockKnockModal = useKnockKnockModal()
const dm = useDmConversations()

const triggerRef = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const profile = ref<Profile | null>(null)
const loading = ref(false)
const fetchError = ref(false)
const cardStyle = ref<Record<string, string>>({})
const dmStarting = ref(false)
const dmError = ref<string | null>(null)

let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const profileCache = new Map<string, Profile>()

function isMobileEnv() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(hover: none), (pointer: coarse), (max-width: 768px)').matches
}

async function fetchProfile(id: string) {
  if (profileCache.has(id)) {
    profile.value = profileCache.get(id)!
    nextTick(() => updatePosition())
    return
  }
  loading.value = true; fetchError.value = false
  try {
    const data = await api.getProfile(id)
    profileCache.set(id, data)
    profile.value = data
    nextTick(() => updatePosition())
  } catch { fetchError.value = true }
  finally { loading.value = false }
}

function updatePosition() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const cardW = 300
  const cardH = cardRef.value?.offsetHeight || 280
  const gap = 8
  let top = rect.top - gap - cardH
  let left = rect.left + rect.width / 2 - cardW / 2
  if (top < 16) top = rect.bottom + gap
  if (left < 12) left = 12
  if (left + cardW > window.innerWidth - 12) left = window.innerWidth - 12 - cardW
  cardStyle.value = { position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${cardW}px`, zIndex: '9999' }
}

function clearTimers() {
  if (showTimer) { clearTimeout(showTimer); showTimer = null }
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
}

function onTriggerEnter() {
  if (!props.authorId || isMobileEnv()) return
  clearTimers()
  showTimer = setTimeout(() => {
    visible.value = true
    nextTick(() => updatePosition())
    if (!profile.value || profile.value.documentId !== props.authorId) fetchProfile(props.authorId!)
  }, 400)
}

function onTriggerLeave() { clearTimers(); hideTimer = setTimeout(() => { visible.value = false }, 250) }

function onCardEnter() { clearTimers() }
function onCardLeave() { clearTimers(); hideTimer = setTimeout(() => { visible.value = false }, 250) }

function goProfile() {
  if (!props.authorId) return
  visible.value = false
  router.push(`/profile/${props.authorId}`)
}

async function goMessage() {
  if (!auth.isLogin) {
    visible.value = false
    loginDialog.open()
    return
  }

  if (dmStarting.value) return
  dmStarting.value = true
  dmError.value = null

  try {
    // 后端按 userNo 创建私聊会话，这里用 documentId（即 userNo），不能用数字 uid
    const docId = profile.value?.documentId
    if (!docId) { dmError.value = '无法获取用户信息'; return }
    const { summary } = await dm.openDirectConversation(docId)
    visible.value = false
    knockKnockModal.open({ dmConversationId: summary.documentId })
  } catch (err: any) {
    dmError.value = err?.message || '无法发起私聊'
  } finally {
    dmStarting.value = false
  }
}

function onTriggerClick(e: MouseEvent) {
  if (!props.authorId || !props.clickable) return
  // 移动端：首次点击弹出简介卡，再次点击进入详情页
  if (isMobileEnv()) {
    if (visible.value) {
      goProfile()
    } else {
      clearTimers()
      visible.value = true
      nextTick(() => updatePosition())
      if (!profile.value || profile.value.documentId !== props.authorId) fetchProfile(props.authorId!)
    }
    return
  }
  // 桌面端：点击直接跳转
  goProfile()
}

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

onBeforeUnmount(() => { clearTimers() })
</script>

<template>
  <div
    ref="triggerRef"
    class="ik-hc-trigger"
    :class="{ 'ik-hc-trigger--clickable': clickable }"
    @mouseenter="onTriggerEnter"
    @mouseleave="onTriggerLeave"
    @click="onTriggerClick"
  >
    <slot />
  </div>

  <Teleport to="body">
    <Transition name="ik-hc">
      <div
        v-if="visible"
        ref="cardRef"
        class="ik-hc-card"
        :style="cardStyle"
        @mouseenter="onCardEnter"
        @mouseleave="onCardLeave"
      >
        <div class="ik-hc__outer">
          <div class="ik-hc__inner">
            <template v-if="loading && !profile">
              <div class="ik-hc__banner"><div class="ik-hc__skel" style="width:100%;height:100%" /></div>
              <div class="ik-hc__avatar-row"><div class="ik-hc__skel" style="width:52px;height:52px;border-radius:999px" /></div>
              <div class="ik-hc__body">
                <div class="ik-hc__skel" style="width:100px;height:16px" />
              </div>
              <div class="ik-hc__stats">
                <div v-for="i in 3" :key="i" class="ik-hc__stat"><div class="ik-hc__skel" style="width:32px;height:15px" /></div>
              </div>
            </template>

            <template v-else-if="profile">
              <div class="ik-hc__banner" @click="goProfile">
                <img :src="profile.equippedCard?.image || '/images/banner.png'" class="ik-hc__banner-img" />
              </div>
              <div class="ik-hc__avatar-row">
                <div class="ik-hc__avatar-wrap" @click="goProfile">
                  <img :src="profile.avatar || '/images/default-avatar.webp'" class="ik-hc__avatar" @error="(e: Event) => (e.target as HTMLImageElement).src = '/images/default-avatar.webp'" />
                  <span class="ik-hc__level">{{ profile.level || 1 }}</span>
                </div>
              </div>
              <div class="ik-hc__body">
                <div class="ik-hc__name-row" @click="goProfile"><span class="ik-hc__name">{{ profile.name || '匿名用户' }}</span></div>
                <p v-if="profile.bio" class="ik-hc__bio">{{ profile.bio }}</p>
                <p v-else class="ik-hc__bio ik-hc__bio--empty">这个人很神秘，什么都没有留下。</p>
              </div>
              <div v-if="profile.stats" class="ik-hc__stats">
                <div class="ik-hc__stat"><span class="ik-hc__stat-num">{{ formatNum(profile.stats.totalViews) }}</span><span class="ik-hc__stat-label">浏览</span></div>
                <div class="ik-hc__stat"><span class="ik-hc__stat-num">{{ formatNum(profile.stats.totalLikes) }}</span><span class="ik-hc__stat-label">获赞</span></div>
                <div class="ik-hc__stat"><span class="ik-hc__stat-num">{{ formatNum(profile.stats.articleCount) }}</span><span class="ik-hc__stat-label">帖子</span></div>
              </div>
              <div v-if="dmError" class="ik-hc__dm-error">{{ dmError }}</div>
              <div class="ik-hc__footer">
                <button class="ik-hc__profile-btn" @click="goProfile">查看主页</button>
                <button
                  v-if="!profile.isSelf"
                  class="ik-hc__profile-btn ik-hc__profile-btn--dm"
                  :disabled="dmStarting"
                  @click="goMessage"
                >{{ dmStarting ? '...' : '私信' }}</button>
              </div>
            </template>

            <div v-else-if="fetchError" class="ik-hc__error">加载失败</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ik-hc-trigger { display: inline-block; }
.ik-hc-trigger--clickable { cursor: pointer; }
.ik-hc-trigger--clickable:hover { opacity: 0.85; }
.ik-hc-card { border-radius: 18px 0 18px 18px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4); pointer-events: auto; }
.ik-hc__outer { width: 100%; height: 100%; padding: 3px; background: #2D2C2D; border-radius: 18px 0 18px 18px; overflow: hidden; }
.ik-hc__inner { width: 100%; height: 100%; background: #141414; border: 3px solid #000; border-radius: 16px 0 16px 16px; overflow: hidden; display: flex; flex-direction: column; }
.ik-hc__banner { width: 100%; height: 90px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); overflow: hidden; cursor: pointer; flex-shrink: 0; }
.ik-hc__banner-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ik-hc__avatar-row { padding: 0 16px; margin-top: -26px; z-index: 1; position: relative; }
.ik-hc__avatar-wrap { position: relative; display: inline-block; cursor: pointer; }
.ik-hc__avatar { width: 52px; height: 52px; border-radius: 999px; object-fit: cover; background: #1b1b1b; border: 3px solid #141414; }
.ik-hc__level { position: absolute; bottom: -2px; right: -2px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px; background: #d7ff00; color: #000; font-size: 10px; font-weight: 900; font-style: italic; display: flex; align-items: center; justify-content: center; line-height: 1; }
.ik-hc__body { padding: 8px 16px 4px; }
.ik-hc__name-row { cursor: pointer; }
.ik-hc__name { font-size: 15px; font-weight: 700; color: #fff; }
.ik-hc__name:hover { color: #d7ff00; }
.ik-hc__bio { margin: 4px 0 0; font-size: 12px; line-height: 1.4; color: rgba(255,255,255,0.5); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
.ik-hc__bio--empty { font-style: italic; color: rgba(255,255,255,0.25); }
.ik-hc__skel { background: #222; border-radius: 6px; animation: ik-hc-pulse 1.2s ease-in-out infinite; }
@keyframes ik-hc-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
.ik-hc__stats { display: flex; justify-content: space-around; padding: 10px 16px; border-top: 1px solid rgba(255,255,255,0.06); }
.ik-hc__stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ik-hc__stat-num { font-size: 15px; font-weight: 700; color: #fff; }
.ik-hc__stat-label { font-size: 11px; color: rgba(255,255,255,0.35); }
.ik-hc__footer { padding: 0 16px 14px; }
.ik-hc__profile-btn { width: 100%; padding: 6px 0; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 700; cursor: pointer; transition: background 140ms, color 140ms, border-color 140ms; }
.ik-hc__profile-btn:hover { background: rgba(215,255,0,0.1); border-color: rgba(215,255,0,0.3); color: #d7ff00; }
.ik-hc__footer { display: flex; gap: 6px; padding: 0 16px 14px; }
.ik-hc__profile-btn--dm { border-color: rgba(0,229,255,0.15); color: rgba(0,229,255,0.6); }
.ik-hc__profile-btn--dm:hover { background: rgba(0,229,255,0.1); border-color: rgba(0,229,255,0.35); color: #00e5ff; }
.ik-hc__profile-btn--dm:disabled { opacity: 0.4; cursor: not-allowed; }
.ik-hc__dm-error { padding: 6px 16px 0; font-size: 11px; color: #ff8a80; text-align: center; }
.ik-hc__error { padding: 24px; text-align: center; font-size: 13px; color: rgba(255,255,255,0.3); }
.ik-hc-enter-active { transition: opacity 160ms ease-out, transform 160ms ease-out; }
.ik-hc-leave-active { transition: opacity 120ms ease-in, transform 120ms ease-in; }
.ik-hc-enter-from { opacity: 0; transform: translateY(6px) scale(0.97); }
.ik-hc-leave-to { opacity: 0; transform: translateY(4px) scale(0.98); }
</style>
