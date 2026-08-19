<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMessage } from 'zenless-ui'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { useLoginDialog } from '@/composables/useLoginDialog'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useDiscussionModal } from '@/composables/useDiscussionModal'
import { resolveErrorMessage } from '@/utils/api-error'
import { formatTime } from '@/utils/time'
import { formatBodyText } from '@/utils/format-body'
import CommentItem from './CommentItem.vue'
import UserHoverCard from './UserHoverCard.vue'
import type { Discussion, Comment } from '@/types/entities'

const DEFAULT_COVER = '/images/default-cover.webp'
const DEFAULT_AVATAR = '/images/default-avatar.webp'

const props = defineProps<{ discussionId: string; coverHint?: number | null }>()
const emit = defineEmits<{ close: []; deleted: [articleId: string] }>()

const api = useApi()
const auth = useAuthStore()
const loginDialog = useLoginDialog()
const confirmDialog = useConfirmDialog()
const discussionModal = useDiscussionModal()
const message = useMessage()

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
const commentInputBoxRef = ref<HTMLElement | null>(null)

const covers = computed(() => discussion.value?.covers ?? [])
const hasCovers = computed(() => covers.value.length > 0)
const firstCover = computed(() => covers.value[0] ?? null)
const coverRatio = computed(() => {
  const c = firstCover.value
  if (c?.width && c?.height && c.width > 0 && c.height > 0) return c.width / c.height
  return 16 / 9
})

const coverIndex = ref(0)
const prevCover = () => { if (coverIndex.value > 0) coverIndex.value-- }
const nextCover = () => { if (coverIndex.value < covers.value.length - 1) coverIndex.value++ }

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

function viewerPrev() {
  if (viewerIndex.value > 0) viewerIndex.value--
}

function viewerNext() {
  if (viewerIndex.value < covers.value.length - 1) viewerIndex.value++
}

function onViewerKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { closeViewer(); return }
  if (e.key === 'ArrowLeft') viewerPrev()
  else if (e.key === 'ArrowRight') viewerNext()
}

// ── Load data ─────────────────────────────────────
async function loadDiscussion() {
  loading.value = true; loadError.value = false
  try { discussion.value = await api.getDiscussion(props.discussionId) }
  catch (err) { loadError.value = true; message.error(resolveErrorMessage(err, '获取帖子失败')) }
  finally { loading.value = false }
}

async function loadComments() {
  if (commentsLoading.value || !commentsHasNext.value) return
  commentsLoading.value = true
  try {
    const page = await api.getComments(props.discussionId, commentsCursor.value)
    comments.value.push(...page.nodes)
    commentsCursor.value = page.endCursor
    commentsHasNext.value = page.hasNextPage
  } catch (err) { message.error(resolveErrorMessage(err, '获取评论失败')) }
  finally { commentsLoading.value = false; commentsInitialLoading.value = false }
}

// ── Actions ───────────────────────────────────────
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
    message.error(resolveErrorMessage(err, '点赞失败'))
  }
}

async function likeComment(c: Comment) {
  if (!auth.isLogin) { loginDialog.open(); return }
  const wasLiked = !!c.liked
  c.liked = !wasLiked
  try { c.likesCount = await api.toggleLike('comment', c.id) }
  catch (err) {
    c.liked = wasLiked
    message.error(resolveErrorMessage(err, '点赞失败'))
  }
}

async function likeReply(reply: Comment['replies'][number]) {
  if (!auth.isLogin) { loginDialog.open(); return }
  const wasLiked = !!reply.liked
  reply.liked = !wasLiked
  try { reply.likesCount = await api.toggleLike('comment', reply.id) }
  catch (err) {
    reply.liked = wasLiked
    message.error(resolveErrorMessage(err, '点赞失败'))
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
  } catch (err) { message.error(resolveErrorMessage(err, '获取回复失败')) }
}

async function loadMoreReplies(comment: Comment) {
  try {
    const cursor = repliesCursor.value[comment.id] || '0'
    const page = await api.getCommentReplies(comment.id, cursor)
    comment.replies = [...comment.replies, ...page.nodes]
    comment.hasMoreReplies = page.hasNextPage
    repliesCursor.value[comment.id] = page.endCursor
  } catch (err) { message.error(resolveErrorMessage(err, '获取回复失败')) }
}

async function sendComment() {
  if (!auth.isLogin) { loginDialog.open(); return }
  if (!newComment.value.trim()) return
  sendingComment.value = true
  const isReply = !!replyTarget.value
  try {
    const trimmed = newComment.value.trim()
    const parentId = replyTarget.value?.id
    const res: any = await api.addDiscussionComment({ discussionId: props.discussionId, content: trimmed, parentId, authorDocumentId: auth.user?.authorId || auth.user?.documentId })
    const localId = res.id || `local-${Date.now()}`
    const localAuthor = { documentId: auth.user?.authorId || auth.user?.documentId, name: auth.user?.name || '我', avatar: auth.user?.avatar, level: auth.user?.level }
    if (isReply && parentId) {
      const parent = comments.value.find(c => c.id === parentId)
      if (parent) parent.replies.push({ id: localId, content: trimmed, liked: false, likesCount: 0, createdAt: new Date().toISOString(), author: localAuthor })
    } else {
      comments.value.unshift({ id: localId, content: trimmed, liked: false, likesCount: 0, createdAt: new Date().toISOString(), author: localAuthor, replies: [] })
    }
    newComment.value = ''; commentInputFocused.value = false; replyTarget.value = null
    if (discussion.value) discussion.value.commentsCount = (discussion.value.commentsCount ?? 0) + 1
    message.success(isReply ? '回复成功' : '评论成功')
  } catch (err) { message.error(resolveErrorMessage(err, '发送失败')) }
  finally { sendingComment.value = false }
}

function startReply(c: Comment) { replyTarget.value = { id: c.id, authorName: c.author?.name || '匿名用户' }; commentInputFocused.value = true }

async function deleteCommentAction(c: Comment) {
  const ok = await confirmDialog.open({ title: '删除评论', message: '确定删除这条评论吗？', confirmText: '删除', danger: true })
  if (!ok) return
  try {
    await api.deleteComment(c.id)
    comments.value = comments.value.filter(x => x.id !== c.id)
    if (discussion.value) discussion.value.commentsCount = Math.max(0, (discussion.value.commentsCount ?? 0) - 1 - (c.replies?.length ?? 0))
    message.success('评论已删除')
  } catch (err) { message.error(resolveErrorMessage(err, '删除失败')) }
}

async function deleteReplyAction(reply: Comment['replies'][number], parent: Comment) {
  const ok = await confirmDialog.open({ title: '删除回复', message: '确定删除这条回复吗？', confirmText: '删除', danger: true })
  if (!ok) return
  try {
    await api.deleteComment(reply.id)
    parent.replies = parent.replies.filter(r => r.id !== reply.id)
    if (discussion.value) discussion.value.commentsCount = Math.max(0, (discussion.value.commentsCount ?? 0) - 1)
    message.success('回复已删除')
  } catch (err) { message.error(resolveErrorMessage(err, '删除失败')) }
}

async function handleDeleteArticle() {
  if (!discussion.value?.id) return
  const ok = await confirmDialog.open({ title: '删除帖子', message: '确定删除这篇帖子吗？', confirmText: '删除', danger: true })
  if (!ok) return
  try { await api.deleteArticle(discussion.value.id); message.success('帖子已删除'); emit('deleted', discussion.value.id); emit('close') }
  catch (err) { message.error(resolveErrorMessage(err, '删除失败')) }
}

const isOwner = computed(() => {
  if (!auth.isLogin || !discussion.value?.author?.documentId) return false
  return auth.user?.authorId === discussion.value.author.documentId || auth.user?.documentId === discussion.value.author.documentId
})

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await loadDiscussion()
  await Promise.all([api.recordArticleView(props.discussionId).catch(() => {}), loadComments()])
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

// Sync comment input height
watch(() => newComment.value, async () => { await nextTick(); const ta = commentInputBoxRef.value?.querySelector('textarea') as HTMLTextAreaElement | null; if (ta) { ta.style.height = '42px'; ta.style.height = `${Math.min(ta.scrollHeight, 62)}px` } })
</script>

<template>
  <div class="ik-overlay" @mousedown.self="emit('close')">
    <div class="ik-overlay__stripe" />

    <!-- Loading -->
    <div v-if="loading" class="ik-dialog">
      <div class="ik-dialog__outer">
        <div class="ik-dialog__inner">
          <div class="ik-dialog__header">
            <span class="ik-dialog__title">加载中...</span>
            <button class="ik-dialog__close" @click="emit('close')"><img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" /></button>
          </div>
          <div class="ik-dialog__body ik-dialog__body--loading">
            <div class="ik-skel ik-skel--cover" />
            <div class="ik-skel ik-skel--line" style="width:55%" />
            <div class="ik-skel ik-skel--line" style="width:100%" />
            <div class="ik-skel ik-skel--line" style="width:75%" />
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="ik-dialog">
      <div class="ik-dialog__outer"><div class="ik-dialog__inner"><div class="ik-dialog__body ik-dialog__body--error">加载失败，请刷新重试</div></div></div>
    </div>

    <!-- Content -->
    <div v-else-if="discussion" class="ik-dialog ik-dialog--full">
      <div class="ik-dialog__outer">
        <div class="ik-dialog__inner">
          <!-- Header -->
          <div class="ik-dialog__header">
            <div class="ik-dialog__header-left">
              <UserHoverCard :author-id="discussion.author?.documentId || discussion.author?.authorId" clickable>
                <div class="ik-dialog__avatar-shell">
                  <img :src="discussion.author?.avatar || DEFAULT_AVATAR" class="ik-dialog__avatar" @error="(e: Event) => (e.target as HTMLImageElement).src = DEFAULT_AVATAR" />
                </div>
              </UserHoverCard>
              <div class="ik-dialog__author-info">
                <UserHoverCard :author-id="discussion.author?.documentId || discussion.author?.authorId" clickable>
                  <span class="ik-dialog__author-name">{{ discussion.author?.name || '匿名用户' }}</span>
                </UserHoverCard>
                <span v-if="discussion.author?.level" class="ik-dialog__level">Lv.{{ discussion.author.level }}</span>
                <span class="ik-dialog__time">{{ formatTime(discussion.createdAt) }} · {{ discussion.views || 0 }} 阅读</span>
              </div>
            </div>
            <button class="ik-dialog__close" @click="emit('close')"><img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" /></button>
          </div>

          <!-- Body (two-column) -->
          <div class="ik-dialog__columns">
            <!-- Left: cover + article -->
            <div class="ik-dialog__left">
              <div v-if="hasCovers" class="ik-dialog__cover-wrap">
                <div class="ik-dialog__cover-scroll">
                  <div v-for="(c, i) in covers" :key="i" class="ik-dialog__cover-slide" :style="{ transform: `translateX(${-coverIndex * 100}%)` }">
                    <img :src="c.url || DEFAULT_COVER" :alt="discussion.title" class="ik-dialog__cover" @error="(e: Event) => (e.target as HTMLImageElement).src = DEFAULT_COVER" @click.stop="openViewer(i)" />
                  </div>
                </div>
                <div v-if="covers.length > 1" class="ik-dialog__cover-nav">
                  <button :disabled="coverIndex === 0" @click="prevCover">&lt;</button>
                  <span class="ik-dialog__cover-dots">
                    <span v-for="(_, i) in covers" :key="i" :class="{ 'is-active': i === coverIndex }" @click="coverIndex = i" />
                  </span>
                  <button :disabled="coverIndex >= covers.length - 1" @click="nextCover">&gt;</button>
                </div>
              </div>
              <div class="ik-dialog__detail">
                <h1 class="ik-dialog__detail-title">{{ discussion.title }}</h1>
                <div v-if="discussion.body" class="ik-dialog__content" v-html="discussion.body" />
                <div v-else-if="discussion.bodyText" class="ik-dialog__content" v-html="formatBodyText(discussion.bodyText)" />
                <p v-else class="ik-dialog__content" style="color:#808080">暂无正文内容</p>
              </div>
            </div>

            <!-- Right: comments -->
            <div class="ik-dialog__right">
              <div class="ik-dialog__comments-scroll">
                <div class="ik-dialog__comments-inner">
                  <template v-if="commentsInitialLoading">
                    <div v-for="n in 4" :key="n" class="ik-comment-skel">
                      <div class="ik-skel" style="width:36px;height:36px;border-radius:999px;flex-shrink:0" />
                      <div style="flex:1;min-width:0">
                        <div class="ik-skel" style="width:80px;height:14px;border-radius:3px" />
                        <div class="ik-skel" style="width:95%;height:14px;border-radius:3px;margin-top:8px" />
                        <div class="ik-skel" style="width:60%;height:14px;border-radius:3px;margin-top:6px" />
                      </div>
                    </div>
                  </template>
                  <div v-else-if="!comments.length" class="ik-empty">暂 无 评 论</div>
                  <CommentItem
                    v-for="(c, idx) in comments" :key="c.id"
                    :comment="c" :index="idx"
                    :current-user-author-id="auth.user?.authorId || auth.user?.documentId"
                    @like-comment="likeComment"
                    @like-reply="likeReply"
                    @reply-comment="startReply"
                    @reply-to-reply="(r, pc) => { replyTarget = { id: pc.id, authorName: r.author?.name || '匿名用户' }; commentInputFocused = true }"
                    @delete-comment="deleteCommentAction"
                    @delete-reply="deleteReplyAction"
                    @load-replies="loadReplies"
                    @load-more-replies="loadMoreReplies"
                  />
                  <div v-if="commentsHasNext" style="text-align:center;padding:8px">
                    <z-button :loading="commentsLoading" @click="loadComments">加载更多评论</z-button>
                  </div>
                  <div v-else-if="comments.length" class="ik-meta" style="text-align:center;padding:8px">- 评论已全部加载 -</div>
                </div>
              </div>

              <!-- Actions bar -->
              <div class="ik-dialog__actions" :class="{ 'ik-dialog__actions--active': commentInputFocused }">
                <div class="ik-engage">
                  <div class="ik-engage__main">
                    <div ref="commentInputBoxRef" class="ik-engage__input-wrap" @click="commentInputFocused = true">
                      <z-input v-model="newComment" type="textarea" class="ik-engage__textarea" :placeholder="replyTarget ? `回复 ${replyTarget.authorName}` : '说点什么...'" @keydown.enter.exact.prevent="sendComment" />
                      <div v-if="!commentInputFocused && !newComment.trim()" class="ik-engage__placeholder">
                        <img :src="auth.user?.avatar || DEFAULT_AVATAR" class="ik-engage__placeholder-avatar" @error="(e: Event) => (e.target as HTMLImageElement).src = DEFAULT_AVATAR" />
                        <span>说点什么...</span>
                      </div>
                    </div>
                    <div class="ik-engage__btns">
                      <button :class="['ik-engage__btn', { 'ik-engage__btn--active': discussion.liked }]" @click="likeArticle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-engage__icon"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>
                        <span>{{ discussion.likesCount || '点赞' }}</span>
                      </button>
                      <button class="ik-engage__btn" @click="message.warning('收藏功能即将开放')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-engage__icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        <span>收藏</span>
                      </button>
                      <button class="ik-engage__btn" @click="commentInputFocused = true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-engage__icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <span>{{ discussion.commentsCount || 0 }}</span>
                      </button>
                      <button v-if="isOwner" class="ik-engage__btn ik-engage__btn--danger" @click="handleDeleteArticle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ik-engage__icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                  <div class="ik-engage__bottom">
                    <div class="ik-engage__bottom-inner">
                      <button class="ik-engage__submit" :disabled="!newComment.trim() || sendingComment" @click="sendComment">{{ sendingComment ? '发送中' : '发送' }}</button>
                      <button class="ik-engage__cancel" @click="commentInputFocused = false; replyTarget = null">取消</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

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
.ik-overlay { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.ik-overlay__stripe { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(40deg, transparent, transparent 3.5px, rgba(255,255,255,0.09) 4.5px, rgba(255,255,255,0.09) 7.5px, transparent 8.5px); }
.ik-dialog { position: relative; width: 70vw; max-height: 80vh; display: flex; flex-direction: column; }
.ik-dialog--full { max-width: 1280px; }
.ik-dialog__outer { padding: 4px; background: #2D2C2D; border-radius: 24px 0 24px 24px; overflow: hidden; display: flex; flex-direction: column; max-height: 80vh; }
.ik-dialog__inner { padding: 4px; background: #000; border-radius: 22px 0 22px 22px; overflow: hidden; display: flex; flex-direction: column; max-height: calc(80vh - 8px); }
.ik-dialog__header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; flex-shrink: 0; background: url("/images/tab-bg-point.webp") repeat, linear-gradient(180deg, #161616 0%, #080808 100%); border-radius: 18px 0 0 0; }
.ik-dialog__header-left { display: flex; align-items: center; gap: 10px; }
.ik-dialog__avatar-shell { width: 40px; height: 40px; border-radius: 999px; border: 3px solid #2d2d2d; overflow: hidden; flex-shrink: 0; }
.ik-dialog__avatar { width: 100%; height: 100%; object-fit: cover; border-radius: 999px; background: #1b1b1b; }
.ik-dialog__author-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ik-dialog__author-name { font-size: 16px; font-weight: 700; color: #fff; }
.ik-dialog__level { font-size: 12px; font-weight: 700; font-style: italic; color: #d7ff00; }
.ik-dialog__time { font-size: 12px; color: #808080; }
.ik-dialog__close { display: flex; align-items: center; justify-content: center; padding: 0; border: none; background: transparent; cursor: pointer; flex-shrink: 0; }
.ik-dialog__close-img { height: 32px; }
.ik-dialog__body--loading { padding: 24px; background: #121212; border-radius: 0 0 18px 18px; display: flex; flex-direction: column; gap: 12px; }
.ik-dialog__body--error { padding: 64px 32px; background: #121212; color: #ffb1b1; text-align: center; border-radius: 0 0 18px 18px; }
.ik-dialog__columns { flex: 1; display: flex; min-height: 0; background: #121212; border-radius: 0 0 18px 18px; overflow: hidden; }
.ik-dialog__left { flex: 3; min-width: 0; overflow-y: auto; background: #070707; margin: 16px 8px 16px 16px; border-radius: 16px; -ms-overflow-style: none; scrollbar-width: none; }
.ik-dialog__left::-webkit-scrollbar { display: none; }
.ik-dialog__cover-wrap { padding: 16px 24px 16px 16px; position: relative; }
.ik-dialog__cover-scroll { width: 100%; overflow: hidden; border-radius: 12px; border: 4px solid #313132; background: #0a0a0a; display: flex; }
.ik-dialog__cover-slide { min-width: 100%; flex-shrink: 0; transition: transform 300ms ease; }
.ik-dialog__cover { display: block; width: 100%; height: auto; max-height: 50vh; object-fit: contain; cursor: pointer; }
.ik-dialog__cover-nav { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 10px 0 0; }
.ik-dialog__cover-nav button { padding: 4px 12px; border: 1px solid #444; background: #1a1a1a; color: #fff; border-radius: 6px; cursor: pointer; font-size: 14px; }
.ik-dialog__cover-nav button:disabled { opacity: 0.3; cursor: not-allowed; }
.ik-dialog__cover-dots { display: flex; gap: 6px; }
.ik-dialog__cover-dots span { width: 8px; height: 8px; border-radius: 50%; background: #444; cursor: pointer; transition: background 200ms; }
.ik-dialog__cover-dots span.is-active { background: #d7ff00; }
.ik-dialog__detail { padding: 0 16px 32px; }
.ik-dialog__detail-title { margin: 0 0 16px; font-size: 26px; font-weight: 900; color: #fff; }
.ik-dialog__content { font-size: 16px; line-height: 1.7; color: #e0e0e0; white-space: normal; word-wrap: break-word; }
.ik-dialog__content:deep(p:empty) { display: none; }
.ik-dialog__right { flex: 2; min-width: 0; display: flex; flex-direction: column; margin: 16px 16px 16px 8px; background: #070707; border-radius: 16px; overflow: hidden; }
.ik-dialog__comments-scroll { flex: 1; min-height: 0; overflow-y: auto; -ms-overflow-style: none; scrollbar-width: none; }
.ik-dialog__comments-scroll::-webkit-scrollbar { display: none; }
.ik-dialog__comments-inner { padding: 16px; }
.ik-dialog__actions { flex-shrink: 0; padding: 8px 16px; background: rgba(7,7,7,0.98); border-top: 1px solid #202020; }
.ik-engage { display: flex; flex-direction: column; color: #f5f5f5; }
.ik-engage__main { display: flex; align-items: center; gap: 12px; }
.ik-engage__input-wrap { position: relative; flex: 1 1 0%; min-width: 0; min-height: 44px; cursor: text; }
.ik-engage__textarea { width: 100%; }
.ik-engage__textarea :deep(.z-input), .ik-engage__textarea :deep(.z-textarea) { min-height: 44px; border: 1px solid #303030 !important; border-radius: 999px !important; background: #171717 !important; }
.ik-engage__textarea :deep(.z-input__inner), .ik-engage__textarea :deep(textarea) { height: 42px; padding: 11px 16px !important; border: none; background: transparent !important; color: #f5f5f5 !important; font: inherit; font-size: 14px !important; line-height: 20px !important; resize: none !important; overflow-y: auto; }
.ik-engage__placeholder { position: absolute; top: 0; right: 0; left: 0; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 16px; color: #8b8b8b; font-size: 14px; pointer-events: none; }
.ik-engage__placeholder-avatar { width: 24px; height: 24px; border-radius: 999px; object-fit: cover; background: #2a2a2a; }
.ik-engage__btns { display: flex; align-items: center; gap: 14px; transition: opacity 140ms ease, transform 220ms ease; }
.ik-dialog__actions--active .ik-engage__btns { opacity: 0; transform: translateX(36px); pointer-events: none; }
.ik-engage__btn { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: none; background: transparent; color: #f1f1f1; font-size: 13px; font-weight: 700; cursor: pointer; transition: color 140ms ease, transform 140ms ease; }
.ik-engage__btn:hover { color: #d7ff00; }
.ik-engage__btn--active { color: #d7ff00; }
.ik-engage__btn--danger { color: #ff6b6b; }
.ik-engage__icon { width: 24px; height: 24px; }
.ik-engage__bottom { max-height: 0; overflow: hidden; opacity: 0; transition: max-height 180ms ease, opacity 140ms ease, margin 180ms ease; }
.ik-dialog__actions--active .ik-engage__bottom { max-height: 44px; margin-top: 8px; opacity: 1; }
.ik-engage__bottom-inner { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.ik-engage__submit { height: 30px; padding: 0 16px; border: none; border-radius: 999px; background: #d7ff00; color: #000; font-size: 13px; font-weight: 900; cursor: pointer; }
.ik-engage__submit:disabled { background: #4a4a4a; color: #9a9a9a; cursor: not-allowed; }
.ik-engage__cancel { height: 30px; padding: 0 16px; border: none; border-radius: 999px; background: transparent; color: #bfbfbf; font-size: 13px; font-weight: 900; cursor: pointer; }
@keyframes ik-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
.ik-skel { border-radius: 6px; background: linear-gradient(90deg, #1a1a1a 25%, #252525 50%, #1a1a1a 75%); background-size: 800px 100%; animation: ik-shimmer 1.6s ease infinite; }
.ik-skel--cover { width: 100%; height: 200px; border-radius: 8px; }
.ik-skel--line { height: 14px; margin-top: 8px; }
.ik-comment-skel { display: flex; gap: 12px; padding: 14px 0; }
.ik-comment-skel + .ik-comment-skel { border-top: 1px solid #1e1e1e; }
.ik-meta { font-size: 13px; color: #9a9a9a; }
/* Mobile */
@media (max-width: 800px) {
  .ik-dialog { width: 90vw; max-height: 90vh; }
  .ik-dialog__outer, .ik-dialog__inner { max-height: 90vh; }
  .ik-dialog__columns { flex-direction: column; overflow-y: auto; }
  .ik-dialog__left { margin: 0; border-radius: 0; overflow-y: visible; flex: none; }
  .ik-dialog__right { margin: 0; border-radius: 0; flex: 1; }
}
@media (max-width: 500px) {
  .ik-dialog { width: 100vw; max-height: 100vh; }
  .ik-dialog__outer, .ik-dialog__inner { border-radius: 0; max-height: 100vh; }
}
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
