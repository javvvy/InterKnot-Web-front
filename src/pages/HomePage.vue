<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useDebounceFn, useWindowSize } from '@vueuse/core'
import { useMessage } from 'zenless-ui'
import { useApi } from '@/composables/useApi'
import { useDiscussionModal } from '@/composables/useDiscussionModal'
import { usePageDataLoading } from '@/composables/usePageDataLoading'
import { resolveErrorMessage } from '@/utils/api-error'
import { getCoverAspectRatio } from '@/utils/cover'
import { pickFirstQuery } from '@/utils/query'
import { calculateSkeletonCount, generateSkeletons, type SkeletonItem } from '@/utils/skeleton'
import DiscussionCard from '@/components/DiscussionCard.vue'
import DiscussionCardSkeleton from '@/components/DiscussionCardSkeleton.vue'
import DiscussionOverlay from '@/components/DiscussionOverlay.vue'
import type { Discussion } from '@/types/entities'

const api = useApi()
const route = useRoute()
const discussionModal = useDiscussionModal()
const message = useMessage()
const pageDataLoading = usePageDataLoading()

const query = ref(pickFirstQuery(route.query.q as string | string[] | undefined))
const loading = ref(false)
const loadingMore = ref(false)
const refreshing = ref(false)
const list = shallowRef<Discussion[]>([])
const endCursor = ref('0')
const hasNextPage = ref(true)
let seenIds = new Set<string>()
const enterAnimationIds = shallowRef(new Set<string>())
const { width: vw } = useWindowSize({ initialWidth: 1200 })

function toUnique(nodes: Discussion[], reset: boolean): Discussion[] {
  if (reset) seenIds = new Set()
  const unique: Discussion[] = []
  for (const n of nodes) {
    if (!n.id || seenIds.has(n.id)) continue
    seenIds.add(n.id)
    unique.push(n)
  }
  return unique
}

async function fetchList(reset = false) {
  if (loading.value || loadingMore.value) return
  if (!hasNextPage.value && !reset) return
  if (reset && !refreshing.value) loading.value = true
  else if (!reset) loadingMore.value = true

  try {
    const page = await api.searchArticles(query.value.trim(), reset ? '0' : endCursor.value)
    const uniqueNodes = toUnique(page.nodes, reset)
    if (reset) {
      enterAnimationIds.value = new Set()
      list.value = uniqueNodes
    } else {
      const nextIds = new Set(enterAnimationIds.value)
      for (const n of uniqueNodes) nextIds.add(n.id)
      enterAnimationIds.value = nextIds
      list.value = [...list.value, ...uniqueNodes]
    }
    endCursor.value = page.endCursor
    hasNextPage.value = page.hasNextPage
    if (reset) window.scrollTo({ top: 0, behavior: 'auto' })
  } catch (err) {
    message.error(resolveErrorMessage(err, '获取帖子失败'))
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const debouncedSearch = useDebounceFn(() => fetchList(true), 300)
watch(() => query.value, () => debouncedSearch())
watch(() => route.query.q, (q) => {
  const v = pickFirstQuery(q as string | string[] | undefined)
  if (v !== query.value) query.value = v
})

function removeArticle(articleId: string) {
  list.value = list.value.filter(x => x.id !== articleId)
}

function goDiscussion(d: Discussion, e: MouseEvent) {
  e.preventDefault()
  discussionModal.open(d.id, { coverAspectRatio: getCoverAspectRatio(d.coverWidth, d.coverHeight) })
  if (!d.isRead) {
    list.value = list.value.map(x => x.id === d.id ? { ...x, isRead: true } : x)
  }
  api.markAsReadBatch([d.id]).catch(() => {})
}

function shouldAnimate(id: string) { return enterAnimationIds.value.has(id) }
function finishAnimation(id: string) {
  if (!enterAnimationIds.value.has(id)) return
  const next = new Set(enterAnimationIds.value)
  next.delete(id)
  enterAnimationIds.value = next
}

async function handleRefresh() {
  if (refreshing.value || loading.value) return
  refreshing.value = true
  window.scrollTo({ top: 0, behavior: 'instant' })
  await fetchList(true)
  await new Promise(r => setTimeout(r, 600))
  refreshing.value = false
}

function onHomeRefresh() { handleRefresh() }

const loadMoreSentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(async () => {
  window.addEventListener('ik:home-refresh', onHomeRefresh)
  await fetchList(true)
  if (loadMoreSentinel.value) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && !loading.value && !loadingMore.value && hasNextPage.value) {
        fetchList(false)
      }
    }, { rootMargin: '360px 0px' })
    observer.observe(loadMoreSentinel.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('ik:home-refresh', onHomeRefresh)
  observer?.disconnect()
})

const skeletonCount = computed(() => calculateSkeletonCount(vw.value, true))
const skeletonItems = computed(() => generateSkeletons(skeletonCount.value))

// Simple CSS columns masonry
const columnCount = computed(() => {
  if (vw.value >= 1600) return 5
  if (vw.value >= 1200) return 4
  if (vw.value >= 800) return 3
  return 2
})

const columns = computed(() => {
  const cols: Discussion[][] = Array.from({ length: columnCount.value }, () => [])
  list.value.forEach((item, i) => {
    cols[i % columnCount.value].push(item)
  })
  return cols
})

const skeletonColumns = computed(() => {
  const cols: SkeletonItem[][] = Array.from({ length: columnCount.value }, () => [])
  skeletonItems.value.forEach((item, i) => {
    cols[i % columnCount.value].push(item)
  })
  return cols
})
</script>

<template>
  <section class="ik-home">
    <!-- Refresh indicator -->
    <Transition name="ik-refresh">
      <div v-if="refreshing" class="ik-refresh-indicator"><i class="z-icon-loading ik-refresh-spin" /></div>
    </Transition>

    <!-- Skeleton -->
    <div v-if="!list.length && loading" class="ik-home__skeleton" role="status" aria-busy="true">
      <div class="ik-masonry" :style="{ '--columns': columnCount }">
        <div v-for="(col, ci) in skeletonColumns" :key="ci" class="ik-masonry__col">
          <DiscussionCardSkeleton v-for="item in col" :key="item.id" :skeleton="item" />
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="!list.length && !loading" class="ik-empty">暂无相关帖子... [ o_x ]/</div>

    <!-- Grid -->
    <div v-else class="ik-home__list">
      <div class="ik-masonry" :style="{ '--columns': columnCount }">
        <div v-for="(col, ci) in columns" :key="ci" class="ik-masonry__col">
          <DiscussionCard
            v-for="item in col" :key="item.id"
            :discussion="item"
            :eager="ci < 2"
            class="ik-masonry__card"
            :class="{ 'ik-masonry-card-enter': shouldAnimate(item.id) }"
            @open="goDiscussion"
            @animationend="finishAnimation(item.id)"
          />
        </div>
      </div>
      <div ref="loadMoreSentinel" class="ik-home__sentinel">
        <div v-if="loadingMore" class="ik-home__loading-more">
          <img src="/images/Bangboo.gif" alt="加载中" style="width:80px;height:80px" />
        </div>
        <span v-else-if="!hasNextPage" class="ik-meta">已经到底啦 [ O_X ] /</span>
      </div>
    </div>

    <!-- Refresh FAB -->
    <z-button
      circle
      class="ik-refresh-fab"
      :loading="refreshing"
      @click="handleRefresh"
    >
      <svg v-if="!refreshing" class="ik-refresh-fab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
      </svg>
    </z-button>

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
  </section>
</template>

<style scoped>
.ik-home { width: min(1600px, calc(100% - 40px)); margin: 0 auto; padding-top: 24px; padding-bottom: 24px; }
.ik-refresh-indicator { display: flex; justify-content: center; align-items: center; height: 56px; color: #d7ff00; font-size: 24px; overflow: hidden; }
.ik-refresh-spin { animation: ik-spin 0.8s linear infinite; }
@keyframes ik-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.ik-refresh-enter-active { transition: height 300ms ease, opacity 300ms ease; }
.ik-refresh-leave-active { transition: height 250ms ease, opacity 200ms ease; }
.ik-refresh-enter-from, .ik-refresh-leave-to { height: 0; opacity: 0; }
.ik-masonry { display: flex; gap: 32px; }
.ik-masonry__col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 24px; }
.ik-masonry__card { width: 100%; }
.ik-masonry-card-enter { animation: ik-card-enter 240ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes ik-card-enter { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
.ik-home__sentinel { min-height: 80px; display: flex; align-items: center; justify-content: center; padding: 8px 0; }
.ik-meta { color: #9a9a9a; font-size: 13px; }
.ik-refresh-fab { position: fixed; right: 32px; bottom: 32px; z-index: 100; width: 28px !important; height: 28px !important; }
.ik-refresh-fab :deep(.z-button__content:empty) { display: none; }
.ik-refresh-fab :deep(.z-button__icon) { left: 50% !important; top: 50% !important; transform: translate(-50%, -50%); }
.ik-refresh-fab :deep(.z-button__icon.is-loading) { animation: ik-fab-spin 1.5s linear infinite; }
.ik-refresh-fab__icon { width: 1em; height: 1em; display: block; }
@keyframes ik-fab-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@media (max-width: 1400px) { .ik-home { width: calc(100% - 32px); } .ik-masonry { gap: 24px; } .ik-masonry__col { gap: 20px; } }
@media (max-width: 1100px) { .ik-refresh-fab { right: 16px; bottom: calc(58px + 16px + env(safe-area-inset-bottom, 0px)); } }
@media (max-width: 768px) { .ik-home { width: calc(100% - 20px); padding-top: 16px; } .ik-masonry { gap: 16px; } .ik-masonry__col { gap: 16px; } }
</style>
