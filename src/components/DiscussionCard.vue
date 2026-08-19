<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import type { Discussion } from '@/types/entities'
import { FALLBACK_COVER_ASPECT_RATIO, getNormalizedCoverAspectRatio } from '@/utils/cover'
import UserHoverCard from '@/components/UserHoverCard.vue'

const DEFAULT_COVER = '/images/default-cover.webp'
const DEFAULT_AVATAR = '/images/default-avatar.webp'

const props = defineProps<{ discussion: Discussion; eager?: boolean }>()
const emit = defineEmits<{ open: [discussion: Discussion, event: MouseEvent]; animationend: [] }>()

const authorName = computed(() => props.discussion.author?.name || '未知作者')
const coverSrc = ref(DEFAULT_COVER)
const coverLoaded = ref(false)
const coverIsFallback = ref(false)
const avatarSrc = ref(DEFAULT_AVATAR)

const hasSize = computed(() =>
  typeof props.discussion.coverWidth === 'number' && props.discussion.coverWidth > 0 &&
  typeof props.discussion.coverHeight === 'number' && props.discussion.coverHeight > 0)

const coverRatio = computed(() => {
  if (hasSize.value) return getNormalizedCoverAspectRatio(props.discussion.coverWidth, props.discussion.coverHeight)
  return FALLBACK_COVER_ASPECT_RATIO
})

watch(() => [props.discussion.id, props.discussion.cover] as const, ([, cover]) => {
  const c = cover?.trim()
  const nextSrc = c || DEFAULT_COVER
  if (nextSrc !== coverSrc.value) {
    coverSrc.value = nextSrc
    coverLoaded.value = false
  }
  coverIsFallback.value = !c
}, { immediate: true })

watch(() => props.discussion.author?.avatar, (av) => {
  avatarSrc.value = av || DEFAULT_AVATAR
}, { immediate: true })

const coverImgRef = ref<HTMLImageElement | null>(null)

onMounted(() => {
  nextTick(() => {
    if (coverImgRef.value?.complete) coverLoaded.value = true
  })
})

function handleOpen(e: MouseEvent) { emit('open', props.discussion, e) }
</script>

<template>
  <article class="ik-card" @click.capture="handleOpen" @animationend="emit('animationend')">
    <router-link :to="`/discussion/${discussion.id}`" class="ik-card__link" @click.prevent>
      <div class="ik-card__cover-wrap">
        <div class="ik-card__cover-frame" :style="{ aspectRatio: String(coverRatio) }">
          <img
            ref="coverImgRef"
            :src="coverSrc"
            :alt="discussion.title"
            class="ik-card__cover"
            :class="{ 'ik-card__cover--loading': !coverLoaded }"
            loading="eager"
            @load="coverLoaded = true"
            @error="coverSrc = DEFAULT_COVER; coverLoaded = true"
          />
        </div>
        <div class="ik-card__views">
          <svg class="ik-card__views-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 5C6.7 5 3 10 2 12c1 2 4.7 7 10 7s9-5 10-7c-1-2-4.7-7-10-7Z"/><circle cx="12" cy="12" r="3.2"/>
          </svg>
          <span>{{ discussion.views || 0 }}</span>
        </div>
      </div>
      <div class="ik-card__body">
        <div class="ik-card__author-row">
          <UserHoverCard :author-id="discussion.author?.documentId || discussion.author?.authorId" clickable>
            <div class="ik-card__avatar-shell">
              <img :src="avatarSrc" :alt="authorName" class="ik-card__avatar-image" loading="lazy" @error="(e: Event) => (e.target as HTMLImageElement).src = DEFAULT_AVATAR" />
            </div>
          </UserHoverCard>
          <UserHoverCard :author-id="discussion.author?.documentId || discussion.author?.authorId" clickable>
            <div class="ik-card__author-block">
              <p class="ik-card__author-name">{{ authorName }}</p>
              <div class="ik-card__author-divider" />
            </div>
          </UserHoverCard>
        </div>
        <h3 class="ik-card__title" :class="{ 'ik-card__title--read': discussion.isRead }">{{ discussion.title }}</h3>
      </div>
    </router-link>
  </article>
</template>

<style scoped>
.ik-card { border-radius: var(--ik-discussion-card-radius); background: var(--ik-discussion-card-outer-bg); padding: var(--ik-discussion-card-padding); overflow: hidden; transition: background-color 180ms ease; contain: layout style paint; }
.ik-card:hover { background: var(--ik-discussion-card-hover-bg); }
.ik-card__link { display: block; border-radius: var(--ik-discussion-card-inner-radius); background: var(--ik-discussion-card-inner-bg); overflow: hidden; outline: none; }
.ik-card__cover-wrap { position: relative; overflow: hidden; }
.ik-card__cover-frame { width: 100%; background: var(--ik-discussion-card-cover-bg); }
.ik-card__cover { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center; transform: scale(1); transition: transform 1.2s cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease; }
.ik-card:hover .ik-card__cover { transform: scale(1.06); }
.ik-card__cover--loading { opacity: 0; }
.ik-card__views { position: absolute; top: 11px; left: 16px; display: inline-flex; align-items: center; gap: 5px; color: #fff; font-size: 14px; font-weight: 700; text-shadow: 0 0 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.9); }
.ik-card__views-icon { width: 22px; height: 22px; }
.ik-card__body { display: flex; flex-direction: column; gap: 8px; padding: 0 8px 12px; }
.ik-card__author-row { position: relative; display: flex; align-items: flex-start; }
.ik-card__avatar-shell { position: relative; margin-top: -28px; width: 54px; height: 54px; padding: 2px; border-radius: 999px; background: var(--ik-discussion-card-inner-bg); }
.ik-card__avatar-image { width: 100%; height: 100%; border-radius: 999px; object-fit: cover; background: #1b1b1b; }
.ik-card__author-block { display: flex; flex-direction: column; justify-content: center; min-height: 32px; padding-left: 8px; margin-left: 4px; width: calc(100% - 58px); }
.ik-card__author-name { margin: 4px 0; font-size: 15px; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ik-card__author-divider { width: 100%; height: 1px; background: #3a3a3a; }
.ik-card__title { margin: 0; font-size: 17px; line-height: 1.25; color: #2196f3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.ik-card__title--read { color: #9e9e9e; }
</style>
