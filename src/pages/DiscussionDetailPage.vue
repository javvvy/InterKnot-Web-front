<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'zenless-ui'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { useLoginDialog } from '@/composables/useLoginDialog'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { usePageDataLoading } from '@/composables/usePageDataLoading'
import { resolveErrorMessage } from '@/utils/api-error'
import { formatTime } from '@/utils/time'
import { formatBodyText } from '@/utils/format-body'
import CommentItem from '@/components/CommentItem.vue'
import UserHoverCard from '@/components/UserHoverCard.vue'
import type { Discussion, Comment } from '@/types/entities'

const DEFAULT_COVER = '/images/default-cover.webp'
const DEFAULT_AVATAR = '/images/default-avatar.webp'

const route = useRoute()
const router = useRouter()
const api = useApi()
const auth = useAuthStore()
const loginDialog = useLoginDialog()
const confirmDialog = useConfirmDialog()
const message = useMessage()
const pageDataLoading = usePageDataLoading()

const discussion = ref<Discussion | null>(null)
const loading = ref(true)
const loadError = ref(false)

const comments = ref<Comment[]>([])
const commentsCursor = ref('')
const commentsHasNext = ref(true)
const commentsLoading = ref(false)
const commentsInitialLoading = ref(true)

const newComment = ref('')
const sendingComment = ref(false)
const commentInputFocused = ref(false)
const replyTarget = ref<{ id: string; authorName: string } | null>(null)

const discussionId = computed(() => String(route.params.id || ''))
const covers = computed(() => discussion.value?.covers ?? [])
const firstCover = computed(() => covers.value[0] ?? null)
const coverIndex = ref(0)
const viewerOpen = ref(false)
const viewerIndex = ref(0)
const viewerEl = ref<HTMLElement | null>(null)

function openViewer(index: number) {
  viewerIndex.value = index
  viewerOpen.value = true
  document.body.style.overflow = 'hidden'
  nextTick(() => viewerEl.value?.focus())
}

function closeViewer() {
  viewerOpen.value = false
  document.body.style.overflow = ''
}

watch(viewerOpen, (open) => {
  if (open) nextTick(() => viewerEl.value?.focus())
})

function viewerPrev() {
  if (viewerIndex.value > 0) viewerIndex.value--
}

function viewerNext() {
  if (viewerIndex.value < covers.value.length - 1) viewerIndex.value++
}

function onViewerKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeViewer()
  else if (e.key === 'ArrowLeft') viewerPrev()
  else if (e.key === 'ArrowRight') viewerNext()
}

async function loadDiscussion() {
  loading.value = true; loadError.value = false
  try { discussion.value = await api.getDiscussion(discussionId.value) }
  catch (err) { loadError.value = true; message.error(resolveErrorMessage(err, '获取帖子失败')) }
  finally { loading.value = false }
}

async function loadComments() {
  if (commentsLoading.value || !commentsHasNext.value) return
  commentsLoading.value = true
  try {
    const page = await api.getComments(discussionId.value, commentsCursor.value)
    comments.value.push(...page.nodes);
    commentsCursor.value = page.endCursor
    commentsHasNext.value = page.hasNextPage
  } catch (err) { message.error(resolveErrorMessage(err)) }
  finally { commentsLoading.value = false; commentsInitialLoading.value = false }
}

async function sendComment() {
  if (!auth.isLogin) { loginDialog.open(); return }
  if (!newComment.value.trim()) return
  sendingComment.value = true
  try {
    const trimmed = newComment.value.trim()
    const res: any = await api.addDiscussionComment({ discussionId: discussionId.value, content: trimmed, parentId: replyTarget.value?.id, authorDocumentId: auth.user?.authorId || auth.user?.documentId })
    comments.value.unshift({ id: res.id || `local-${Date.now()}`, content: trimmed, liked: false, likesCount: 0, createdAt: new Date().toISOString(), author: { documentId: auth.user?.authorId, name: auth.user?.name || '我', avatar: auth.user?.avatar, level: auth.user?.level }, replies: [] })
    newComment.value = ''; commentInputFocused.value = false; replyTarget.value = null
    if (discussion.value) discussion.value.commentsCount = (discussion.value.commentsCount ?? 0) + 1
    message.success('评论成功')
  } catch (err) { message.error(resolveErrorMessage(err)) }
  finally { sendingComment.value = false }
}

async function likeArticle() {
  if (!discussion.value) return
  if (!auth.isLogin) { loginDialog.open(); return }
  const wasLiked = !!discussion.value.liked
  discussion.value.liked = !wasLiked
  try {
    discussion.value.likesCount = await api.toggleLike('article', discussion.value.id)
  }
  catch (err) {
    discussion.value.liked = wasLiked
    message.error(resolveErrorMessage(err))
  }
}

async function likeComment(c: Comment) {
  if (!auth.isLogin) { loginDialog.open(); return }
  const wasLiked = !!c.liked
  c.liked = !wasLiked
  try { c.likesCount = await api.toggleLike('comment', c.id) }
  catch (err) {
    c.liked = wasLiked
    message.error(resolveErrorMessage(err))
  }
}

async function likeReply(reply: Comment['replies'][number]) {
  if (!auth.isLogin) { loginDialog.open(); return }
  const wasLiked = !!reply.liked
  reply.liked = !wasLiked
  try { reply.likesCount = await api.toggleLike('comment', reply.id) }
  catch (err) {
    reply.liked = wasLiked
    message.error(resolveErrorMessage(err))
  }
}

const repliesCursor = ref<Record<string, string>>({})

async function loadReplies(comment: Comment) {
  try {
    const page = await api.getCommentReplies(comment.id, '0')
    comment.replies = page.nodes
    comment.repliesLoaded = true
    comment.hasMoreReplies = page.hasNextPage
    repliesCursor.value[comment.id] = page.endCursor
  } catch (err) { message.error(resolveErrorMessage(err)) }
}

async function loadMoreReplies(comment: Comment) {
  try {
    const cursor = repliesCursor.value[comment.id] || '0'
    const page = await api.getCommentReplies(comment.id, cursor)
    comment.replies = [...comment.replies, ...page.nodes]
    comment.hasMoreReplies = page.hasNextPage
    repliesCursor.value[comment.id] = page.endCursor
  } catch (err) { message.error(resolveErrorMessage(err)) }
}

async function deleteComment(c: Comment) {
  const ok = await confirmDialog.open({ title: '删除评论', message: '确定删除？', confirmText: '删除', danger: true })
  if (!ok) return
  try { await api.deleteComment(c.id); comments.value = comments.value.filter(x => x.id !== c.id); message.success('已删除') }
  catch (err) { message.error(resolveErrorMessage(err)) }
}

async function deleteReply(reply: Comment['replies'][number], parent: Comment) {
  const ok = await confirmDialog.open({ title: '删除回复', message: '确定删除？', confirmText: '删除', danger: true })
  if (!ok) return
  try { await api.deleteComment(reply.id); parent.replies = parent.replies.filter(r => r.id !== reply.id); message.success('已删除') }
  catch (err) { message.error(resolveErrorMessage(err)) }
}

onMounted(async () => {
  pageDataLoading.claim()
  try { await loadDiscussion(); await Promise.all([api.recordArticleView(discussionId.value).catch(() => {}), loadComments()]) }
  finally { pageDataLoading.finish() }
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <section class="ik-detail-page">
    <!-- Loading -->
    <div v-if="loading" class="ik-detail-page__skeleton">
      <div class="ik-skel ik-skel--cover" /><div class="ik-skel ik-skel--title" /><div class="ik-skel ik-skel--line" /><div class="ik-skel ik-skel--line" style="width:75%" />
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="ik-empty">加载失败，请刷新重试</div>

    <!-- Content -->
    <template v-else-if="discussion">
      <div class="ik-detail-page__shell">
        <div class="ik-detail-page__outer">
          <div class="ik-detail-page__inner">
            <!-- Header -->
            <div class="ik-detail-page__header">
              <div class="ik-detail-page__author">
                <UserHoverCard :author-id="discussion.author?.documentId || discussion.author?.authorId" clickable>
                  <img :src="discussion.author?.avatar || DEFAULT_AVATAR" class="ik-detail-page__avatar" @error="(e: Event) => (e.target as HTMLImageElement).src = DEFAULT_AVATAR" />
                </UserHoverCard>
                <div>
                  <UserHoverCard :author-id="discussion.author?.documentId || discussion.author?.authorId" clickable>
                    <span class="ik-detail-page__author-name">{{ discussion.author?.name || '匿名用户' }}</span>
                  </UserHoverCard>
                  <span v-if="discussion.author?.level" class="ik-detail-page__level">Lv.{{ discussion.author.level }}</span>
                  <div class="ik-detail-page__time">{{ formatTime(discussion.createdAt) }} · {{ discussion.views || 0 }} 阅读</div>
                </div>
              </div>
            </div>

            <div class="ik-detail-page__body">
              <!-- Left -->
              <div class="ik-detail-page__left">
                <div v-if="covers.length" class="ik-detail-page__cover">
                  <div class="ik-detail-page__cover-slide"><img :key="coverIndex" :src="covers[coverIndex]?.url || DEFAULT_COVER" class="ik-detail-page__cover-img" @error="(e: Event) => (e.target as HTMLImageElement).src = DEFAULT_COVER" @click="openViewer(coverIndex)" /></div>
                  <div v-if="covers.length > 1" class="ik-detail-page__cover-nav">
                    <button :disabled="coverIndex === 0" @click="coverIndex--">&lt;</button>
                    <span v-for="(_, i) in covers" :key="i" :class="{ 'is-active': i === coverIndex }" @click="coverIndex = i" />
                    <button :disabled="coverIndex >= covers.length - 1" @click="coverIndex++">&gt;</button>
                  </div>
                </div>
                <h1 class="ik-detail-page__title">{{ discussion.title }}</h1>
                <div v-if="discussion.body" class="ik-detail-page__content" v-html="discussion.body" />
                <div v-else-if="discussion.bodyText" class="ik-detail-page__content" v-html="formatBodyText(discussion.bodyText)" />
              </div>

              <!-- Right: comments -->
              <div class="ik-detail-page__right">
                <div class="ik-detail-page__comments-scroll">
                  <template v-if="commentsInitialLoading">
                    <div v-for="n in 4" :key="n" style="display:flex;gap:12px;padding:14px 0">
                      <div class="ik-skel" style="width:36px;height:36px;border-radius:999px" />
                      <div style="flex:1"><div class="ik-skel" style="width:80px;height:14px;border-radius:3px" /><div class="ik-skel" style="width:95%;height:14px;border-radius:3px;margin-top:8px" /></div>
                    </div>
                  </template>
                  <div v-else-if="!comments.length" class="ik-empty">暂无评论</div>
                  <CommentItem
                    v-for="(c, idx) in comments" :key="c.id"
                    :comment="c" :index="idx"
                    :current-user-author-id="auth.user?.authorId || auth.user?.documentId"
                    @like-comment="likeComment"
                    @like-reply="likeReply"
                    @reply-comment="(c) => { replyTarget = { id: c.id, authorName: c.author?.name || '匿名用户' }; commentInputFocused = true }"
                    @reply-to-reply="(r, pc) => { replyTarget = { id: pc.id, authorName: r.author?.name || '匿名用户' }; commentInputFocused = true }"
                    @delete-comment="deleteComment"
                    @delete-reply="deleteReply"
                    @load-replies="loadReplies"
                    @load-more-replies="loadMoreReplies"
                  />
                  <div v-if="commentsHasNext" style="text-align:center;padding:8px"><z-button :loading="commentsLoading" @click="loadComments">加载更多</z-button></div>
                </div>

                <div class="ik-detail-page__actions">
                  <div class="ik-engage-row">
                    <div class="ik-engage-row__input-wrap">
                      <z-input v-model="newComment" type="textarea" class="ik-engage-row__textarea" :placeholder="replyTarget ? `回复 ${replyTarget.authorName}` : '说点什么...'" @keydown.enter.exact.prevent="sendComment" />
                    </div>
                    <div class="ik-engage-row__btns">
                      <button :class="['ik-engage-row__btn', { 'ik-engage-row__btn--active': discussion.liked }]" @click="likeArticle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>
                        <span>{{ discussion.likesCount || '点赞' }}</span>
                      </button>
                      <button class="ik-engage-row__btn" @click="commentInputFocused = true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <span>{{ discussion.commentsCount || 0 }}</span>
                      </button>
                    </div>
                  </div>
                  <div class="ik-detail-page__submit-row">
                    <button class="ik-detail-page__submit" :disabled="!newComment.trim() || sendingComment" @click="sendComment">{{ sendingComment ? '发送中' : '发送' }}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>

  <!-- Image viewer -->
  <Teleport to="body">
    <div v-if="viewerOpen" class="ik-viewer" @click.self="closeViewer" @keydown="onViewerKeydown" tabindex="-1" ref="viewerEl">
      <button class="ik-viewer__close" @click="closeViewer">&times;</button>
      <button v-if="viewerIndex > 0" class="ik-viewer__nav ik-viewer__nav--prev" @click.stop="viewerPrev">&lsaquo;</button>
      <div class="ik-viewer__img-wrap">
        <img :src="covers[viewerIndex]?.url || DEFAULT_COVER" class="ik-viewer__img" @error="(e: Event) => (e.target as HTMLImageElement).src = DEFAULT_COVER" />
      </div>
      <button v-if="viewerIndex < covers.length - 1" class="ik-viewer__nav ik-viewer__nav--next" @click.stop="viewerNext">&rsaquo;</button>
      <div v-if="covers.length > 1" class="ik-viewer__counter">{{ viewerIndex + 1 }} / {{ covers.length }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.ik-detail-page { width: min(1280px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 100px; }
.ik-detail-page__shell { padding: 4px; background: #2D2C2D; border-radius: 24px 0 24px 24px; overflow: hidden; }
.ik-detail-page__outer { padding: 4px; background: #000; border-radius: 22px 0 22px 22px; overflow: hidden; }
.ik-detail-page__inner { display: flex; flex-direction: column; }
.ik-detail-page__header { display: flex; align-items: center; padding: 12px 20px; background: url("/images/tab-bg-point.webp") repeat, linear-gradient(180deg, #161616 0%, #080808 100%); border-radius: 18px 0 0 0; }
.ik-detail-page__author { display: flex; align-items: center; gap: 10px; }
.ik-detail-page__avatar { width: 40px; height: 40px; border-radius: 999px; object-fit: cover; border: 3px solid #2d2d2d; background: #1b1b1b; }
.ik-detail-page__author-name { font-size: 16px; font-weight: 700; color: #fff; }
.ik-detail-page__level { font-size: 12px; font-weight: 700; font-style: italic; color: #d7ff00; margin-left: 8px; }
.ik-detail-page__time { font-size: 12px; color: #808080; white-space: nowrap; }
.ik-detail-page__body { display: flex; background: #121212; border-radius: 0 0 18px 18px; overflow: hidden; min-height: 0; }
.ik-detail-page__left { flex: 3; min-width: 0; overflow-y: auto; background: #070707; margin: 16px 8px 16px 16px; border-radius: 16px; padding: 16px 24px 32px 16px; -ms-overflow-style: none; scrollbar-width: none; }
.ik-detail-page__left::-webkit-scrollbar { display: none; }
.ik-detail-page__cover { margin-bottom: 16px; }
.ik-detail-page__cover-slide { width: 100%; border-radius: 12px; border: 4px solid #313132; overflow: hidden; background: #0a0a0a; }
.ik-detail-page__cover-slide img { display: block; width: 100%; max-height: 50vh; object-fit: contain; cursor: zoom-in; }
.ik-detail-page__cover-nav { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 0; }
.ik-detail-page__cover-nav button { padding: 4px 12px; border: 1px solid #444; background: #1a1a1a; color: #fff; border-radius: 6px; cursor: pointer; }
.ik-detail-page__cover-nav button:disabled { opacity: 0.3; }
.ik-detail-page__cover-nav span { width: 8px; height: 8px; border-radius: 50%; background: #444; cursor: pointer; }
.ik-detail-page__cover-nav span.is-active { background: #d7ff00; }
.ik-detail-page__title { font-size: 26px; font-weight: 900; color: #fff; margin: 0 0 16px; }
.ik-detail-page__content { font-size: 16px; line-height: 1.7; color: #e0e0e0; white-space: normal; word-wrap: break-word; }
.ik-detail-page__right { flex: 2; min-width: 0; display: flex; flex-direction: column; margin: 16px 16px 16px 8px; background: #070707; border-radius: 16px; overflow: hidden; }
.ik-detail-page__comments-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px; -ms-overflow-style: none; scrollbar-width: none; }
.ik-detail-page__comments-scroll::-webkit-scrollbar { display: none; }
.ik-detail-page__actions { flex-shrink: 0; padding: 12px 16px; background: rgba(7,7,7,0.98); border-top: 1px solid #202020; display: flex; flex-direction: column; gap: 8px; }
.ik-engage-row { display: flex; align-items: center; gap: 12px; }
.ik-engage-row__input-wrap { flex: 1; }
.ik-engage-row__textarea :deep(.z-textarea__inner) { min-height: 42px; border: 1px solid #303030; border-radius: 999px; background: #171717; color: #f5f5f5; padding: 11px 16px; resize: none; }
.ik-engage-row__btns { display: flex; align-items: center; gap: 14px; }
.ik-engage-row__btn { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: none; background: transparent; color: #f1f1f1; font-size: 13px; font-weight: 700; cursor: pointer; transition: color 140ms; }
.ik-engage-row__btn:hover { color: #d7ff00; }
.ik-engage-row__btn--active { color: #d7ff00; }
.ik-detail-page__submit-row { display: flex; justify-content: flex-end; }
.ik-detail-page__submit { height: 30px; padding: 0 16px; border: none; border-radius: 999px; background: #d7ff00; color: #000; font-size: 13px; font-weight: 900; cursor: pointer; }
.ik-detail-page__submit:disabled { background: #4a4a4a; color: #9a9a9a; cursor: not-allowed; }
.ik-detail-page__skeleton { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
@keyframes ik-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
.ik-skel { border-radius: 6px; background: linear-gradient(90deg, #1a1a1a 25%, #252525 50%, #1a1a1a 75%); background-size: 800px 100%; animation: ik-shimmer 1.6s ease infinite; }
.ik-skel--cover { width: 100%; height: 200px; }
.ik-skel--title { width: 55%; height: 26px; }
.ik-skel--line { width: 100%; height: 14px; }
@media (max-width: 800px) { .ik-detail-page__body { flex-direction: column; overflow-y: auto; } .ik-detail-page__left { margin: 0; border-radius: 0; overflow-y: visible; flex: none; } .ik-detail-page__right { margin: 0; border-radius: 0; min-height: 300px; } }
</style>

<style>
/* ── Image viewer ── */
.ik-viewer { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.92); outline: none; }
.ik-viewer__close { position: absolute; top: 16px; right: 20px; width: 44px; height: 44px; border: none; border-radius: 999px; background: rgba(255,255,255,0.08); color: #fff; font-size: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 2; transition: background 150ms; }
.ik-viewer__close:hover { background: rgba(255,255,255,0.18); }
.ik-viewer__nav { position: absolute; top: 50%; transform: translateY(-50%); width: 52px; height: 80px; border: none; border-radius: 10px; background: rgba(255,255,255,0.06); color: #fff; font-size: 42px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 2; transition: background 150ms; font-weight: 100; }
.ik-viewer__nav:hover { background: rgba(255,255,255,0.14); }
.ik-viewer__nav--prev { left: 16px; }
.ik-viewer__nav--next { right: 16px; }
.ik-viewer__img-wrap { max-width: 90vw; max-height: 90vh; }
.ik-viewer__img { display: block; max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 4px; }
.ik-viewer__counter { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 5px 16px; border-radius: 999px; background: rgba(0,0,0,0.6); color: #ccc; font-size: 13px; font-weight: 700; }
</style>
