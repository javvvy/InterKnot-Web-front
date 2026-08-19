<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'zenless-ui'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { useDiscussionModal } from '@/composables/useDiscussionModal'
import { usePageDataLoading } from '@/composables/usePageDataLoading'
import { resolveErrorMessage } from '@/utils/api-error'
import { getCoverAspectRatio } from '@/utils/cover'
import { pickFirstQuery } from '@/utils/query'
import AvatarModal from '@/components/AvatarModal.vue'
import BusinessCardModal from '@/components/BusinessCardModal.vue'
import DiscussionCard from '@/components/DiscussionCard.vue'
import DiscussionOverlay from '@/components/DiscussionOverlay.vue'
import ProfileSettingsModal from '@/components/ProfileSettingsModal.vue'
import type { BusinessCard, Discussion, Profile } from '@/types/entities'

const route = useRoute()
const router = useRouter()
const api = useApi()
const auth = useAuthStore()
const discussionModal = useDiscussionModal()
const message = useMessage()
const pageDataLoading = usePageDataLoading()

const profile = ref<Profile | null>(null)
const loadError = ref(false)
const loading = ref(false)
const articles = ref<Discussion[]>([])
const articlesCursor = ref('0')
const articlesHasNext = ref(true)
const articlesLoading = ref(false)

const profileId = computed(() => String(route.params.id || ''))

const modalQuery = computed(() => String(route.query.modal || ''))
const showSettings = computed(() => ['settings', 'edit-name', 'edit-bio', 'social', 'logout'].includes(modalQuery.value))

function openModal(name: string) { router.replace({ query: { ...route.query, modal: name } }) }
function closeModal() { const { modal: _, ...rest } = route.query; router.replace({ query: rest }) }

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function removeArticle(articleId: string) {
  articles.value = articles.value.filter(x => x.id !== articleId)
}

function onAvatarEquipped(avatar: any) {
  if (profile.value && avatar) {
    profile.value.avatar = avatar.url || avatar.imageUrl || avatar.image
  }
}

function onCustomAvatarUploaded(url: string) {
  if (profile.value) profile.value.avatar = url
  auth.fetchSelfUser()
}

function onCardEquipped(card: BusinessCard | null) {
  if (profile.value) profile.value.equippedCard = card || undefined
}

function goArticle(d: Discussion, e: MouseEvent) {
  e.preventDefault()
  discussionModal.open(d.id, { coverAspectRatio: getCoverAspectRatio(d.coverWidth, d.coverHeight) })
}

async function loadProfileArticles(reset = false) {
  if (articlesLoading.value) return
  if (!reset && !articlesHasNext.value) return
  articlesLoading.value = true
  try {
    const cursor = reset ? '0' : articlesCursor.value
    const page = await api.getProfileArticles(profileId.value, cursor, 12)
    if (reset) articles.value = page.nodes
    else articles.value.push(...page.nodes)
    articlesCursor.value = page.endCursor
    articlesHasNext.value = page.hasNextPage
  } catch (err) { message.error(resolveErrorMessage(err)) }
  finally { articlesLoading.value = false }
}


const loadMoreSentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function setupObserver() {
  if (!loadMoreSentinel.value) return
  observer = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && !articlesLoading.value && articlesHasNext.value) {
      loadProfileArticles()
    }
  }, { rootMargin: '200px' })
  observer.observe(loadMoreSentinel.value)
}

watch(articlesHasNext, async (hasNext) => {
  if (hasNext) { await nextTick(); setupObserver() }
})

watch(profileId, () => {
  if (observer) { observer.disconnect(); observer = null }
  articles.value = []
  articlesCursor.value = '0'
  articlesHasNext.value = true
  loadProfile()
})

function applyProfileDefaults(p: Profile) {
  if (!p.avatar) p.avatar = '/images/default-avatar.webp'
  if (!p.equippedCard) {
    p.equippedCard = {
      documentId: '__default__',
      name: '默认名片',
      type: 'default',
      image: '/images/banner.png',
    }
  }
}

async function loadProfile() {
  loading.value = true
  pageDataLoading.claim()
  try {
    profile.value = await api.getProfile(profileId.value)
    if (profile.value) applyProfileDefaults(profile.value)
    if (!profile.value?.isHidden) await loadProfileArticles(true)
  } catch (err) { loadError.value = true; message.error(resolveErrorMessage(err, '获取用户信息失败')) }
  finally { loading.value = false; pageDataLoading.finish() }
}

onMounted(() => {
  window.addEventListener('popstate', discussionModal.handlePopState)
  loadProfile()
})

onBeforeUnmount(() => {
  if (observer) { observer.disconnect(); observer = null }
  window.removeEventListener('popstate', discussionModal.handlePopState)
  if (discussionModal.isOpen.value) discussionModal.teardown()
})
</script>

<template>
  <section class="ik-profile">
    <!-- Loading -->
    <template v-if="loading">
      <div class="ik-profile__frame">
        <div class="ik-profile__inner">
          <div class="ik-profile__body">
            <div class="ik-profile__tabbar"><div class="ik-skel" style="width:120px;height:34px;border-radius:999px" /></div>
            <div class="ik-profile__aframe">
              <div class="ik-profile__banner ik-profile__banner--skel">
                <div class="ik-skel" style="width:90px;height:90px;border-radius:999px" />
                <div class="ik-skel" style="width:160px;height:30px;border-radius:6px" />
              </div>
              <div class="ik-profile__grid">
                <div v-for="n in 6" :key="n" class="ik-skel" style="aspect-ratio:3/4;border-radius:12px" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Error -->
    <div v-else-if="loadError" class="ik-empty">加载失败，请刷新重试</div>

    <!-- Content -->
    <template v-else-if="profile">
      <div class="ik-profile__frame">
        <div class="ik-profile__inner">
          <div class="ik-profile__body">
            <!-- Tab bar -->
            <div class="ik-profile__tabbar">
              <div class="ik-profile__uid">
                <span>UID:</span><span class="ik-profile__uid-val">{{ profile.uid }}</span>
              </div>
              <z-button v-if="profile.isSelf" @click="openModal('settings')">更多操作</z-button>
            </div>

            <!-- A-frame -->
            <div class="ik-profile__aframe">
              <!-- Banner card -->
              <div class="ik-profile__banner" :style="profile.equippedCard?.image ? { backgroundImage: `url(${profile.equippedCard.image})` } : undefined">
                <div class="ik-profile__user">
                  <div class="ik-profile__avatar-wrap">
                    <div class="ik-profile__avatar">
                      <img :src="profile.avatar || '/images/default-avatar.webp'" @error="(e: Event) => (e.target as HTMLImageElement).src = '/images/default-avatar.webp'" />
                    </div>
                    <span class="ik-profile__level">{{ profile.level || 1 }}</span>
                  </div>
                  <div class="ik-profile__info">
                    <h1 class="ik-profile__name">{{ profile.name || '匿名用户' }}</h1>
                    <span class="ik-profile__title-tag">暂无称号</span>
                  </div>
                </div>
                <div v-if="profile.stats" class="ik-profile__stats">
                  <span>浏览 {{ formatNum(profile.stats.totalViews) }}</span>
                  <span>-</span>
                  <span>评论 {{ formatNum(profile.stats.totalComments) }}</span>
                  <span>-</span>
                  <span>点赞 {{ formatNum(profile.stats.totalLikes) }}</span>
                </div>
              </div>
              <z-pattern type="squares" class="ik-profile__banner-footer">
                <p v-if="profile.bio" class="ik-profile__bio">{{ profile.bio }}</p>
                <p v-else class="ik-profile__bio ik-profile__bio--empty">这个人很神秘，什么都没有留下。</p>
              </z-pattern>

              <!-- Article grid -->
              <div class="ik-profile__grid-wrap">
                <div v-if="profile.isHidden" class="ik-profile__grid-empty">该用户已隐藏个人资料</div>
                <div v-else class="ik-profile__grid">
                  <div v-if="!articles.length && !articlesLoading" class="ik-profile__grid-empty">还没有发布任何内容哦</div>
                  <DiscussionCard v-for="item in articles" :key="item.id" :discussion="item" class="ik-profile__card" @open="goArticle" />
                </div>
                <div v-if="articlesHasNext" ref="loadMoreSentinel" class="ik-profile__sentinel">
                  <span v-if="articlesLoading">加载中...</span>
                </div>
                <div v-else-if="articles.length" class="ik-profile__sentinel">
                  <span class="ik-meta">已经到底啦</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom actions -->
      <div v-if="profile.isSelf" class="ik-profile__actions">
        <z-button @click="openModal('avatar')">修改头像</z-button>
        <z-button disabled>修改称号</z-button>
        <z-button @click="openModal('banner')">修改名片</z-button>
      </div>

      <!-- Settings modal -->
      <Teleport to="body">
        <ProfileSettingsModal
          v-if="showSettings"
          :current-name="profile.name"
          :current-bio="profile.bio"
          :current-hidden="profile.profileHidden"
          :initial-sub="modalQuery === 'settings' ? '' : modalQuery"
          @close="closeModal"
          @name-updated="(n) => profile.name = n"
          @bio-updated="(b) => profile.bio = b"
          @hidden-updated="(h) => profile.profileHidden = h"
        />
      </Teleport>

      <!-- Discussion overlay -->
      <Teleport to="body">
        <Transition name="ik-overlay" @after-leave="discussionModal.clearAfterLeave()">
          <DiscussionOverlay
            v-if="discussionModal.isOpen.value"
            :discussion-id="discussionModal.discussionId.value || ''"
            :cover-hint="discussionModal.coverHint.value"
            @close="discussionModal.close()"
            @deleted="removeArticle"
          />
        </Transition>
      </Teleport>

      <!-- Avatar modal -->
      <AvatarModal v-if="modalQuery === 'avatar'" @close="closeModal" @equipped="onAvatarEquipped" @custom-uploaded="onCustomAvatarUploaded" />

      <!-- Business card modal -->
      <BusinessCardModal v-if="modalQuery === 'banner'" :profile="(profile as any)" @close="closeModal" @equipped="onCardEquipped" />
    </template>
  </section>
</template>

<style scoped>
.ik-profile { width: 100%; max-width: 1600px; margin: 0 auto; padding: 16px 16px 24px; }
.ik-profile__frame { padding: 4px; background: #2D2C2D; border-radius: 24px; overflow: hidden; }
.ik-profile__inner { padding: 4px; background: #000; border-radius: 22px; overflow: hidden; }
.ik-profile__body { background: transparent; border-radius: 20px; overflow: hidden; }
.ik-profile__tabbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; min-height: 52px; background: url("/images/tab-bg-point.webp") repeat, linear-gradient(180deg, #161616 0%, #080808 100%); border-radius: 0 0 16px 16px; }
.ik-profile__uid { display: flex; align-items: center; gap: 6px; padding: 6px 14px; background: #000; border-radius: 999px; font-weight: 700; font-size: 14px; color: #fff; }
.ik-profile__uid-val { font-family: monospace; }
.ik-profile__aframe { background: linear-gradient(180deg, #010101 0%, #161616 100%); }
.ik-profile__banner { position: relative; min-height: 240px; display: flex; flex-direction: column; justify-content: space-between; gap: 24px; padding: 32px 36px; margin: 12px 16px 0; border-radius: 14px; background: #2a2d33 url("/images/banner.png") center/cover no-repeat; overflow: hidden; }
.ik-profile__banner--skel { display: flex; align-items: center; gap: 40px; background: linear-gradient(135deg, #1a1a1a, #222); }
.ik-profile__user { display: flex; align-items: flex-start; gap: 20px; z-index: 1; }
.ik-profile__avatar-wrap { position: relative; flex-shrink: 0; }
.ik-profile__avatar { width: 90px; height: 90px; border-radius: 999px; overflow: hidden; border: 4px solid #000; box-shadow: 0 4px 16px rgba(0,0,0,0.25); background: #000; }
.ik-profile__avatar img { width: 100%; height: 100%; object-fit: cover; }
.ik-profile__level { position: absolute; top: -4px; left: -4px; min-width: 32px; height: 32px; border-radius: 999px; background: #000; border: 2px solid #000; color: #fff; font-size: 13px; font-weight: 900; line-height: 28px; text-align: center; padding: 0 6px; }
.ik-profile__info { display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
.ik-profile__name { margin: 0; font-size: 30px; font-weight: 900; color: #fff; line-height: 1.1; text-shadow: 1px 1px 0 rgba(0,0,0,0.4); }
.ik-profile__title-tag { display: inline-block; align-self: flex-start; padding: 5px 16px; border-radius: 999px; background: #000; color: rgba(255,255,255,0.6); font-size: 14px; font-weight: 700; font-style: italic; }
.ik-profile__stats { display: flex; align-items: center; gap: 10px; color: #fff; font-size: 15px; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.35); z-index: 1; }
.ik-profile__banner-footer { padding: 8px 34px; }
.ik-profile__bio { margin: 0; font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.95); line-height: 1.5; }
.ik-profile__bio--empty { color: rgba(255,255,255,0.35); font-style: italic; }
.ik-profile__grid-wrap { padding: 16px; }
.ik-profile__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.ik-profile__grid-empty { grid-column: 1/-1; display: flex; align-items: center; justify-content: center; min-height: 200px; color: #555; font-size: 14px; border-radius: 16px; background: #0f0f0f; border: 1px solid #1f1f1f; }
.ik-profile__card { border-radius: 16px; overflow: hidden; }
.ik-profile__actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 16px; }
@keyframes ik-skel-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.ik-skel { background: #222; animation: ik-skel-pulse 1.5s ease-in-out infinite; }
.ik-profile__sentinel { display: flex; align-items: center; justify-content: center; padding: 24px 0; color: #666; font-size: 13px; font-weight: 700; }
@media (min-width: 640px) { .ik-profile__grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1024px) { .ik-profile__grid { grid-template-columns: repeat(6, 1fr); } }
@media (max-width: 639px) { .ik-profile__banner { padding: 22px 18px; } .ik-profile__avatar { width: 68px; height: 68px; } .ik-profile__name { font-size: 22px; } }
</style>
