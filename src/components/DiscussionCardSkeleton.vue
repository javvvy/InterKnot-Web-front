<script setup lang="ts">
import type { SkeletonItem } from '@/utils/skeleton'
defineProps<{ skeleton?: SkeletonItem }>()
</script>

<template>
  <article class="ik-card-skel">
    <div class="ik-card-skel__cover" :style="{ aspectRatio: String(skeleton?.coverAspectRatio || 1.576) }" />
    <div class="ik-card-skel__body">
      <div class="ik-card-skel__author">
        <div class="ik-card-skel__avatar" />
        <div class="ik-card-skel__name" :style="{ width: `${(skeleton?.authorWidth || 0.5) * 100}%` }" />
      </div>
      <div class="ik-card-skel__title" :style="{ width: `${(skeleton?.titleWidth || 0.8) * 100}%` }" />
    </div>
  </article>
</template>

<style scoped>
.ik-card-skel {
  border-radius: var(--ik-discussion-card-radius);
  background: var(--ik-discussion-card-outer-bg);
  padding: var(--ik-discussion-card-padding);
  overflow: hidden;
  contain: layout style paint;
}
.ik-card-skel__cover {
  width: 100%;
  background: var(--ik-discussion-card-placeholder-bg);
  border-radius: var(--ik-discussion-card-inner-radius) var(--ik-discussion-card-inner-radius) 0 0;
  animation: ik-skel-pulse 1.5s ease-in-out infinite;
}
.ik-card-skel__body {
  padding: var(--ik-discussion-card-body-padding);
  display: flex; flex-direction: column; gap: var(--ik-discussion-card-body-gap);
  background: var(--ik-discussion-card-inner-bg);
  border-radius: 0 0 var(--ik-discussion-card-inner-radius) var(--ik-discussion-card-inner-radius);
}
.ik-card-skel__author {
  display: flex; align-items: flex-start; gap: 8px;
}
.ik-card-skel__avatar {
  margin-top: -28px;
  width: 54px; height: 54px; border-radius: 999px;
  background: var(--ik-discussion-card-placeholder-bg);
  border: 2px solid var(--ik-discussion-card-inner-bg);
  animation: ik-skel-pulse 1.5s ease-in-out infinite;
}
.ik-card-skel__name, .ik-card-skel__title {
  height: 16px; border-radius: 4px;
  background: var(--ik-discussion-card-placeholder-bg);
  animation: ik-skel-pulse 1.5s ease-in-out infinite;
}
.ik-card-skel__name { margin-top: 4px; }
.ik-card-skel__title { margin-top: 8px; height: 20px; }
@keyframes ik-skel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@media (prefers-reduced-motion: reduce) { .ik-card-skel__cover, .ik-card-skel__avatar, .ik-card-skel__name, .ik-card-skel__title { animation: none; opacity: 0.6; } }
</style>
