<script setup lang="ts">
import type { Comment, CommentReply } from '@/types/entities'
import { formatTime } from '@/utils/time'
import UserHoverCard from './UserHoverCard.vue'

const props = defineProps<{
  comment: Comment
  index?: number
  currentUserAuthorId?: string
}>()

const emit = defineEmits<{
  likeComment: [comment: Comment]
  likeReply: [reply: CommentReply]
  replyComment: [comment: Comment]
  replyToReply: [reply: CommentReply, parentComment: Comment]
  deleteComment: [comment: Comment]
  deleteReply: [reply: CommentReply, parentComment: Comment]
  loadReplies: [comment: Comment]
  loadMoreReplies: [comment: Comment]
}>()

const DEFAULT_AVATAR = '/images/default-avatar.webp'

function canDelete(authorId?: string) {
  if (!props.currentUserAuthorId || !authorId) return false
  return String(props.currentUserAuthorId) === String(authorId)
}

function getAvatarError(e: Event) {
  (e.target as HTMLImageElement).src = DEFAULT_AVATAR
}
</script>

<template>
  <div class="ik-comment">
    <div class="ik-comment__main">
      <div class="ik-comment__avatar-col">
        <UserHoverCard :author-id="comment.author?.documentId || comment.author?.authorId" clickable>
          <img
            :src="comment.author?.avatar || DEFAULT_AVATAR"
            :alt="comment.author?.name || ''"
            class="ik-comment__avatar"
            @error="getAvatarError"
          />
        </UserHoverCard>
      </div>
      <div class="ik-comment__content-col">
        <div class="ik-comment__top">
          <UserHoverCard :author-id="comment.author?.documentId || comment.author?.authorId" clickable>
            <span class="ik-comment__name">{{ comment.author?.name || '匿名用户' }}</span>
          </UserHoverCard>
          <span v-if="comment.author?.level" class="ik-comment__level">Lv.{{ comment.author.level }}</span>
          <span class="ik-comment__floor">F{{ index != null ? index + 1 : '?' }}</span>
        </div>
        <div class="ik-comment__body">{{ comment.content }}</div>
        <div class="ik-comment__footer">
          <span class="ik-comment__time">{{ formatTime(comment.createdAt) }}</span>
          <div class="ik-comment__actions">
            <button :class="['ik-comment__action', { 'ik-comment__action--active': comment.liked }]" @click="emit('likeComment', comment)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-comment__action-icon"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>
              <span v-if="comment.likesCount">{{ comment.likesCount }}</span>
            </button>
            <button class="ik-comment__action" @click="emit('replyComment', comment)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-comment__action-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
            <button v-if="canDelete(comment.author?.documentId)" class="ik-comment__action ik-comment__action--danger" @click="emit('deleteComment', comment)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-comment__action-icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- Replies -->
    <div v-if="comment.replies?.length" class="ik-comment__replies">
      <div v-for="reply in comment.replies" :key="reply.id" class="ik-reply">
        <div class="ik-reply__main">
          <UserHoverCard :author-id="reply.author?.documentId || reply.author?.authorId" clickable>
            <img :src="reply.author?.avatar || DEFAULT_AVATAR" class="ik-reply__avatar" @error="getAvatarError" />
          </UserHoverCard>
          <div class="ik-reply__content-col">
            <div class="ik-reply__top">
              <UserHoverCard :author-id="reply.author?.documentId || reply.author?.authorId" clickable>
                <span class="ik-reply__name">{{ reply.author?.name || '匿名用户' }}</span>
              </UserHoverCard>
              <span v-if="reply.author?.level" class="ik-reply__level">Lv.{{ reply.author.level }}</span>
            </div>
            <div class="ik-reply__body">{{ reply.content }}</div>
            <div class="ik-reply__footer">
              <span class="ik-reply__time">{{ formatTime(reply.createdAt) }}</span>
              <div class="ik-reply__actions">
                <button :class="['ik-reply__action', { 'ik-reply__action--active': reply.liked }]" @click="emit('likeReply', reply)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-reply__action-icon"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>
                  <span v-if="reply.likesCount">{{ reply.likesCount }}</span>
                </button>
                <button class="ik-reply__action" @click="emit('replyToReply', reply, comment)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-reply__action-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </button>
                <button v-if="canDelete(reply.author?.documentId)" class="ik-reply__action ik-reply__action--danger" @click="emit('deleteReply', reply, comment)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-reply__action-icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <button v-if="comment.replies?.length && !comment.repliesLoaded" class="ik-comment__more" @click="emit('loadReplies', comment)">查看全部回复</button>
    <button v-else-if="comment.repliesLoaded && comment.hasMoreReplies" class="ik-comment__more" @click="emit('loadMoreReplies', comment)">加载更多回复</button>
  </div>
</template>

<style scoped>
.ik-comment { display: flex; flex-direction: column; }
.ik-comment + .ik-comment { border-top: 1px solid #1e1e1e; }
.ik-comment__main { display: flex; gap: 12px; padding: 14px 0; }
.ik-comment__avatar-col { flex-shrink: 0; }
.ik-comment__avatar { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; background: #1b1b1b; }
.ik-comment__content-col { flex: 1; min-width: 0; }
.ik-comment__top { display: flex; align-items: center; gap: 8px; }
.ik-comment__name { font-size: 14px; font-weight: 700; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ik-comment__level { font-size: 12px; font-weight: 700; font-style: italic; color: #d7ff00; }
.ik-comment__floor { margin-left: auto; padding: 2px 8px; border-radius: 0 6px 6px 6px; background: #333; color: #aaa; font-size: 12px; font-weight: 700; }
.ik-comment__body { margin-top: 6px; font-size: 15px; color: #f0f0f0; white-space: pre-wrap; word-wrap: break-word; line-height: 1.5; }
.ik-comment__footer { margin-top: 8px; display: flex; justify-content: space-between; align-items: center; }
.ik-comment__time { font-size: 12px; color: #555; }
.ik-comment__actions { display: flex; gap: 4px; }
.ik-comment__action { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border: none; background: transparent; color: #666; font-size: 13px; cursor: pointer; border-radius: 4px; transition: color 140ms; }
.ik-comment__action:hover { color: #d7ff00; }
.ik-comment__action--active { color: #d7ff00; }
.ik-comment__action--danger:hover { color: #ff6b6b; }
.ik-comment__action-icon { width: 16px; height: 16px; }
.ik-comment__replies { margin-left: 48px; border-top: 1px solid rgba(255,255,255,0.04); padding-left: 12px; }
.ik-comment__more { margin-left: 48px; padding: 4px 0 8px; border: none; background: transparent; color: #d7ff00; font-size: 13px; font-weight: 700; cursor: pointer; text-align: left; transition: color 140ms; }
.ik-comment__more:hover { color: #eaff4d; }
.ik-reply__main { display: flex; gap: 10px; padding: 10px 0; }
.ik-reply__avatar { width: 28px; height: 28px; border-radius: 999px; object-fit: cover; background: #1b1b1b; flex-shrink: 0; }
.ik-reply__content-col { flex: 1; min-width: 0; }
.ik-reply__top { display: flex; align-items: center; gap: 6px; }
.ik-reply__name { font-size: 13px; font-weight: 700; color: #999; }
.ik-reply__level { font-size: 11px; font-weight: 700; font-style: italic; color: #d7ff00; }
.ik-reply__body { margin-top: 4px; font-size: 14px; color: #f0f0f0; white-space: pre-wrap; word-wrap: break-word; }
.ik-reply__footer { margin-top: 6px; display: flex; justify-content: space-between; align-items: center; }
.ik-reply__time { font-size: 11px; color: #555; }
.ik-reply__actions { display: flex; gap: 2px; }
.ik-reply__action { display: inline-flex; align-items: center; gap: 2px; padding: 1px 5px; border: none; background: transparent; color: #666; font-size: 12px; cursor: pointer; border-radius: 4px; }
.ik-reply__action:hover { color: #d7ff00; }
.ik-reply__action--active { color: #d7ff00; }
.ik-reply__action--danger:hover { color: #ff6b6b; }
.ik-reply__action-icon { width: 14px; height: 14px; }
</style>
