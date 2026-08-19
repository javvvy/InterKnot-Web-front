import { useAuthStore } from '@/stores/auth'
import { useLoginDialog } from '@/composables/useLoginDialog'
import type { Pagination } from '@/types/api'
import type {
  Author, Discussion, Comment, CommentReply, Profile, BusinessCard, Avatar,
  DraftArticle, UploadedFile,
} from '@/types/entities'
import { DEFAULT_PAGE_SIZE, parseStart } from '@/utils/pagination'

interface AuthResult { token: string | null; user: Author }
interface SendCodeResult { email: string; sent: boolean; expiresIn: number; cooldown: number }
interface CommentPayload { discussionId: string; content: string; parentId?: string; authorDocumentId?: string }
interface BusinessCardsResult { cards: BusinessCard[]; equippedCardDocumentId: string | null; equippedCard: BusinessCard | null }

const BASE = ''

// 网关 JwtAuthGlobalFilter 只读取 `token` header（非 Authorization: Bearer）
async function req<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = useAuthStore()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) }
  if (auth.token) headers['token'] = auth.token
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (res.status === 401 || res.status === 403) {
    auth.clearSession()
    useLoginDialog().open()
    throw new Error('登录已过期，请重新登录')
  }
  const json = await res.json()
  if (json.code !== '1' && json.code !== 1) throw new Error(json.msg || '请求失败')
  return json.data ?? json
}

/** 通用请求：支持 GET query params（用于敲敲/私聊等新后端） */
async function apiReq<T = unknown>(path: string, options: { method?: string; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const auth = useAuthStore()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth.token) headers['token'] = auth.token

  let url = `${BASE}${path}`
  if (options.query) {
    const params = new URLSearchParams(options.query)
    url += `?${params.toString()}`
  }

  const init: RequestInit = { method: options.method || 'GET', headers }
  if (options.method && options.method !== 'GET' && options.body != null) {
    init.body = JSON.stringify(options.body)
  }

  const res = await fetch(url, init)
  if (res.status === 401 || res.status === 403) {
    auth.clearSession()
    useLoginDialog().open()
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (res.status === 204) return undefined as unknown as T
  const json = await res.json()
  if (json && (json.code === '1' || json.code === 1) && 'data' in json) {
    return (json.data as T) ?? (json as T)
  }
  return json as T
}

// ── 字段映射（后端 3.0 使用 xxxNo 命名，前端统一映射为 documentId） ──

function mapUser(u: Record<string, unknown>): Author {
  const no = (u.userNo ?? u.documentId) as string | undefined
  const hidden = u.profileHidden == null ? undefined : (u.profileHidden === true || u.profileHidden === 1 ? 1 : 0)
  return {
    id: (u.id as string | number | undefined) ?? no,
    documentId: no,
    authorId: no,
    userName: (u.userName ?? u.nickName) as string | undefined,
    nickName: (u.nickName ?? u.userName) as string | undefined,
    username: (u.userName ?? u.username) as string | undefined,
    name: (u.nickName ?? u.name ?? u.userName) as string | undefined,
    email: u.email as string | undefined,
    avatar: u.avatar as string | undefined,
    exp: u.exp as number | undefined,
    level: u.level as number | undefined,
    profileHidden: hidden,
    bio: u.bio as string | undefined,
  }
}

function mapCover(c: Record<string, unknown>) {
  return {
    documentId: (c.coverNo ?? c.documentId) as string | undefined,
    url: (c.url || '') as string,
    width: c.width as number | undefined,
    height: c.height as number | undefined,
  }
}

function mapArticle(a: Record<string, unknown>): Discussion {
  const covers = Array.isArray(a.covers) ? (a.covers as Record<string, unknown>[]).map(mapCover) : []
  const firstCover = covers[0]
  return {
    id: (a.articleNo ?? a.documentId ?? a.id) as string,
    documentId: (a.articleNo ?? a.documentId) as string | undefined,
    title: (a.title || '') as string,
    body: (a.textHtml ?? a.body) as string | undefined,
    bodyText: (a.body ?? a.rawBodyText) as string | undefined,
    rawBodyText: a.rawBodyText as string | undefined,
    covers,
    cover: firstCover?.url || (a.cover as string | undefined),
    coverWidth: (firstCover?.width ?? a.coverWidth) as number | undefined,
    coverHeight: (firstCover?.height ?? a.coverHeight) as number | undefined,
    views: (a.views ?? 0) as number,
    likesCount: (a.likesCount ?? 0) as number,
    commentsCount: (a.commentsCount ?? 0) as number,
    isRead: a.isRead != null ? !!a.isRead : undefined,
    liked: a.isLiked != null ? !!a.isLiked : (a.liked != null ? !!a.liked : undefined),
    createdAt: a.createdAt as string | undefined,
    updatedAt: a.updatedAt as string | undefined,
    author: a.author ? mapUser(a.author as Record<string, unknown>) : {} as Author,
  }
}

function mapReply(r: Record<string, unknown>): CommentReply {
  return {
    id: (r.commentNo ?? r.documentId ?? r.id) as string,
    content: (r.content || '') as string,
    liked: r.isLiked != null ? !!r.isLiked : undefined,
    likesCount: (r.likeCount ?? r.likesCount ?? 0) as number,
    createdAt: r.createdAt as string | undefined,
    author: r.author ? mapUser(r.author as Record<string, unknown>) : ({} as Author),
  }
}

function mapComment(c: Record<string, unknown>): Comment {
  const lastReply = c.lastReply as Record<string, unknown> | undefined
  return {
    id: (c.commentNo ?? c.documentId ?? c.id) as string,
    documentId: (c.commentNo ?? c.documentId) as string | undefined,
    content: (c.content || '') as string,
    liked: c.isLiked != null ? !!c.isLiked : undefined,
    likesCount: (c.likeCount ?? c.likesCount ?? 0) as number,
    createdAt: c.createdAt as string | undefined,
    author: c.author ? mapUser(c.author as Record<string, unknown>) : ({} as Author),
    replies: lastReply ? [mapReply(lastReply)] : [],
    repliesLoaded: false,
    hasMoreReplies: false,
  }
}

function mapCard(c: Record<string, unknown>): BusinessCard {
  const w = c.width != null ? Number(c.width) : undefined
  const h = c.height != null ? Number(c.height) : undefined
  return {
    documentId: (c.cardNo ?? c.documentId ?? '') as string,
    name: (c.name || '') as string,
    description: c.description as string | undefined,
    type: (c.type || 'cards') as string,
    url: c.url as string | undefined,
    width: c.width as string | undefined,
    height: c.height as string | undefined,
    image: c.url as string | undefined,
    imageWidth: w,
    imageHeight: h,
  }
}

function mapAvatar(a: Record<string, unknown>): Avatar {
  const w = a.width != null ? Number(a.width) : undefined
  const h = a.height != null ? Number(a.height) : undefined
  return {
    documentId: (a.avatarNo ?? a.documentId ?? '') as string,
    name: (a.name || '') as string,
    type: (a.type || 'custom') as string,
    url: a.url as string | undefined,
    imageUrl: a.url as string | undefined,
    image: a.url as string | undefined,
    imageWidth: w,
    imageHeight: h,
    width: w,
    height: h,
  }
}

// ── Auth ──────────────────────────────────────────
async function login(email: string, password: string): Promise<AuthResult> {
  const data = await req<{ jwt: string; user: Record<string, unknown> }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  })
  return { token: data.jwt, user: mapUser(data.user) }
}

async function sendRegisterCode(email: string): Promise<SendCodeResult> {
  const data = await req<{ email: string; sent: boolean; expires: number; cooldown: number }>(
    '/api/auth/send-register-code', { method: 'POST', body: JSON.stringify({ email }) },
  )
  return {
    email: data.email,
    sent: data.sent,
    expiresIn: data.expires ?? 300,
    cooldown: data.cooldown ?? 300,
  }
}

async function registerWithCode(email: string, code: string, password: string): Promise<AuthResult> {
  const data = await req<{ jwt: string; user: Record<string, unknown> }>('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ email, code, password }),
  })
  return { token: data.jwt, user: mapUser(data.user) }
}

// ── Articles ──────────────────────────────────────
async function searchArticles(query: string, endCursor: string, limit = DEFAULT_PAGE_SIZE): Promise<Pagination<Discussion>> {
  void query // 后端暂无关键词搜索接口，搜索降级为文章列表
  const start = parseStart(endCursor)
  const page = Math.floor(start / limit) + 1
  const params = new URLSearchParams({ page: String(page), pageSize: String(limit) })
  const data = await req<{ total: number; records: Record<string, unknown>[] }>(`/api/article?${params}`)
  const nodes = (data.records || []).map(mapArticle)
  return {
    nodes,
    endCursor: String(page * limit),
    hasNextPage: page * limit < (data.total || 0),
  }
}

async function getDiscussion(id: string): Promise<Discussion> {
  const data = await req<Record<string, unknown>>(`/api/article/detail/${encodeURIComponent(id)}`)
  return mapArticle(data)
}

async function recordArticleView(id: string): Promise<number> {
  await req(`/api/article/${encodeURIComponent(id)}/view`, { method: 'POST' })
  return 0
}

async function toggleLike(targetType: string, targetId: string): Promise<number> {
  const path = targetType === 'comment'
    ? `/api/comments/${encodeURIComponent(targetId)}/like`
    : `/api/article/${encodeURIComponent(targetId)}/like`
  const count = await req<number>(path, { method: 'POST' })
  return Number(count ?? 0)
}

async function batchCheckLikes(targetType: string, targetIds: string[]): Promise<Record<string, boolean>> {
  if (!targetIds.length) return {}
  if (targetType === 'comment') {
    const data = await req<{ commentNo: string; isLiked: boolean }[]>('/api/comments/likes', {
      method: 'POST', body: JSON.stringify({ commentNos: targetIds }),
    })
    return Object.fromEntries((data || []).map(x => [x.commentNo, !!x.isLiked]))
  }
  const data = await req<{ articleNo: string; isLiked: boolean }[]>('/api/article/likes', {
    method: 'POST', body: JSON.stringify({ articleNos: targetIds }),
  })
  return Object.fromEntries((data || []).map(x => [x.articleNo, !!x.isLiked]))
}

async function markAsReadBatch(ids: string[]): Promise<void> {
  if (!ids.length) return
  const auth = useAuthStore()
  const userNo = auth.user?.authorId || auth.user?.documentId || ''
  await req(`/api/article/reads?userNo=${encodeURIComponent(userNo)}`, {
    method: 'POST', body: JSON.stringify({ articleNos: ids, markAsRead: true }),
  })
}

// ── Comments ──────────────────────────────────────
async function getComments(articleId: string, endCursor: string, limit = 10): Promise<Pagination<Comment>> {
  const start = parseStart(endCursor)
  const page = Math.floor(start / limit) + 1
  const data = await req<{ total: number; records: Record<string, unknown>[] }>(
    `/api/comments/list?articleNo=${encodeURIComponent(articleId)}&page=${page}&pageSize=${limit}`,
  )
  const nodes = (data.records || []).map(mapComment)
  return {
    nodes,
    endCursor: String(page * limit),
    hasNextPage: page * limit < (data.total || 0),
  }
}

async function getCommentReplies(commentNo: string, endCursor: string, limit = 10): Promise<Pagination<CommentReply>> {
  const start = parseStart(endCursor)
  const page = Math.floor(start / limit) + 1
  const data = await req<{ total: number; records: Record<string, unknown>[] }>(
    `/api/comments/replyList?commentNo=${encodeURIComponent(commentNo)}&page=${page}&pageSize=${limit}`,
  )
  const nodes = (data.records || []).map(mapReply)
  return {
    nodes,
    endCursor: String(page * limit),
    hasNextPage: page * limit < (data.total || 0),
  }
}

async function addDiscussionComment(payload: CommentPayload): Promise<Comment> {
  const body: Record<string, unknown> = {
    articleNo: payload.discussionId,
    content: payload.content,
  }
  if (payload.parentId) body.replyTo = payload.parentId
  const data = await req<Record<string, unknown>>('/api/comments', { method: 'POST', body: JSON.stringify(body) })
  // 后端返回 CommentVO，映射出真实 commentNo 作为 id，供发表后立即点赞使用
  const comment = mapComment(data ?? {})
  const auth = useAuthStore()
  // 后端 create 未回填 author，用当前登录用户补齐
  if (!comment.author?.documentId && !comment.author?.authorId) {
    comment.author = {
      documentId: auth.user?.authorId,
      authorId: auth.user?.authorId,
      name: auth.user?.name || '我',
      avatar: auth.user?.avatar,
      level: auth.user?.level,
    }
  }
  if (!comment.content) comment.content = payload.content
  comment.repliesLoaded = true
  return comment
}

async function deleteComment(commentId: string): Promise<void> {
  await req(`/api/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' })
}

// ── Profile ───────────────────────────────────────
async function getProfile(documentId: string): Promise<Profile> {
  const data = await req<Record<string, unknown>>(`/api/me/profile/${encodeURIComponent(documentId)}`)
  const auth = useAuthStore()
  const selfId = auth.user?.authorId || auth.user?.documentId
  const isSelf = !!(selfId && selfId === data.userNo)
  const hidden = data.profileHidden === true || data.profileHidden === 1 || data.profileHidden === '1'
  const card = data.card as Record<string, unknown> | undefined
  return {
    documentId: (data.userNo ?? documentId) as string,
    uid: typeof data.UID === 'number' ? data.UID
      : typeof data.UID === 'string' ? Number(data.UID)
      : undefined,
    name: (data.nickName || data.userName) as string | undefined,
    bio: data.bio as string | undefined,
    avatar: data.avatar as string | undefined,
    level: data.level as number | undefined,
    exp: data.exp as number | undefined,
    isSelf,
    isHidden: hidden,
    profileHidden: hidden,
    equippedCard: card ? mapCard(card) : undefined,
  }
}

async function getProfileArticles(documentId: string, endCursor: string, limit = 6): Promise<Pagination<Discussion>> {
  const start = parseStart(endCursor)
  const page = Math.floor(start / limit) + 1
  const data = await req<{ total: number; records: Record<string, unknown>[] }>(
    `/api/article/profile/${encodeURIComponent(documentId)}?page=${page}&pageSize=${limit}`,
  )
  const nodes = (data.records || []).map(mapArticle)
  return {
    nodes,
    endCursor: String(page * limit),
    hasNextPage: page * limit < (data.total || 0),
  }
}

// ── Drafts ────────────────────────────────────────
async function createArticleDraft(payload: { title: string; text: string; coverId?: unknown; authorId?: string }): Promise<DraftArticle> {
  const data = await req<{ draftNo: string }>('/api/article', {
    method: 'POST',
    body: JSON.stringify({ title: payload.title, text: payload.text, userNo: payload.authorId }),
  })
  return { documentId: data.draftNo, title: payload.title, text: payload.text, hasPublishedVersion: false }
}

async function updateArticleDraft(id: string, payload: { title?: string; text?: string; coverId?: unknown }): Promise<DraftArticle> {
  const body: Record<string, unknown> = {}
  if (payload.title != null) body.title = payload.title
  if (payload.text != null) body.text = payload.text
  const data = await req<{ title: string; text: string; updatedAt: string }>(`/api/article/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(body),
  })
  return { documentId: id, title: data.title, text: data.text, hasPublishedVersion: false, updatedAt: data.updatedAt }
}

async function publishArticleDraft(id: string): Promise<void> {
  await req(`/api/article/${encodeURIComponent(id)}/publish`, { method: 'POST' })
}

async function deleteArticle(id: string): Promise<void> {
  await req(`/api/article/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

async function deleteDraft(id: string): Promise<void> {
  await req(`/api/article/my/draft/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

async function deleteDraftCover(draftNo: string, coverNo: string): Promise<void> {
  await req(`/api/article/my/draft/${encodeURIComponent(draftNo)}/cover?coverNo=${encodeURIComponent(coverNo)}`, { method: 'DELETE' })
}

async function getMyDrafts(endCursor: string, limit = 10): Promise<Pagination<DraftArticle>> {
  const start = parseStart(endCursor)
  const page = Math.floor(start / limit) + 1
  const data = await req<{ total: number; records: Record<string, unknown>[] }>(
    `/api/article/my?page=${page}&pageSize=${limit}`,
  )
  const nodes = (data.records || []).map((a: Record<string, unknown>) => ({
    documentId: (a.draftNo || a.documentId || '') as string,
    title: (a.title || '') as string,
    text: (a.text || a.bodyText || '') as string,
    cover: Array.isArray(a.covers) ? (a.covers as Record<string, unknown>[]).map(mapCover) : [],
    hasPublishedVersion: (a.hasPublishedVersion ?? true) as boolean,
    createdAt: a.createdAt as string | undefined,
    updatedAt: a.updatedAt as string | undefined,
    author: a.author ? mapUser(a.author as Record<string, unknown>) : undefined,
  }))
  return {
    nodes,
    endCursor: String(page * limit),
    hasNextPage: page * limit < (data.total || 0),
  }
}

async function getMyDraftDetail(documentId: string): Promise<DraftArticle> {
  const data = await req<Record<string, unknown>>(`/api/article/my/${encodeURIComponent(documentId)}`)
  return {
    documentId: (data.draftNo || documentId) as string,
    title: (data.title || '') as string,
    text: (data.text || data.bodyText || '') as string,
    cover: Array.isArray(data.covers) ? (data.covers as Record<string, unknown>[]).map(mapCover) : [],
    hasPublishedVersion: (data.hasPublishedVersion ?? true) as boolean,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
    author: data.author ? mapUser(data.author as Record<string, unknown>) : undefined,
  }
}

// ── Me ────────────────────────────────────────────
async function getSelfUser(): Promise<Author> {
  const data = await req<Record<string, unknown>>('/api/me/profile')
  return mapUser(data)
}

async function getMyBusinessCards(): Promise<BusinessCardsResult> {
  const data = await req<Record<string, unknown>[]>('/api/me/cards')
  const raw = data || []
  const cards: BusinessCard[] = raw.map(mapCard)
  const equippedRaw = raw.find((c) => c.equipped === true) ?? null
  const equipped: BusinessCard | null = equippedRaw ? mapCard(equippedRaw) : null
  return { cards, equippedCardDocumentId: equipped?.documentId ?? null, equippedCard: equipped }
}

async function equipBusinessCard(documentId: string | null): Promise<void> {
  await req(`/api/me/cards/equip?cardNo=${encodeURIComponent(documentId || '')}`, { method: 'POST' })
}

async function getMyAvatars(): Promise<Avatar[]> {
  const data = await req<Record<string, unknown>[]>('/api/me/avatars')
  return (data || []).map(mapAvatar)
}

async function equipAvatar(documentId: string | null): Promise<void> {
  await req(`/api/me/avatars/equip?avatarNo=${encodeURIComponent(documentId || '')}`, { method: 'POST' })
}

async function updateMyName(name: string): Promise<void> {
  await req('/api/me/profile', { method: 'POST', body: JSON.stringify({ nickName: name }) })
}

async function updateMyBio(bio: string): Promise<void> {
  await req('/api/me/profile', { method: 'POST', body: JSON.stringify({ bio }) })
}

async function updateMyVisibility(profileHidden: boolean): Promise<void> {
  await req('/api/me/profile', { method: 'POST', body: JSON.stringify({ profileHidden }) })
}

// ── Upload ────────────────────────────────────────
async function uploadImage(file: File, documentId: string, scene: string = 'cover', onProgress?: (percent: number) => void): Promise<UploadedFile> {
  const auth = useAuthStore()
  const formData = new FormData()
  formData.append('file', file)
  // 后端 FileServiceImpl 仅识别 avatar / cover 两种 scene
  formData.append('scene', scene === 'article_cover' ? 'cover' : scene)
  formData.append('no', documentId)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/api/media/upload`)

    if (auth.token) xhr.setRequestHeader('token', auth.token)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText)
        if (json.code !== '1' && json.code !== 1) {
          reject(new Error(json.msg || '上传失败'))
          return
        }
        const data = json.data
        resolve({
          id: 0,
          documentId: (data.fileNo || '') as string,
          url: (data.url || '') as string,
          width: data.width as number | undefined,
          height: data.height as number | undefined,
        })
      } catch (err) {
        reject(err instanceof Error ? err : new Error('解析上传响应失败'))
      }
    }

    xhr.onerror = () => reject(new Error('网络异常，上传失败'))
    xhr.send(formData)
  })
}

async function uploadCustomAvatar(file: File, onProgress?: (percent: number) => void): Promise<UploadedFile> {
  const auth = useAuthStore()
  return uploadImage(file, auth.user?.documentId || auth.user?.authorId || '', 'avatar', onProgress)
}

// ── Pinned ────────────────────────────────────────
async function getPinnedArticles(_limit = 50): Promise<Discussion[]> {
  return []
}

async function updatePinnedArticles(_pinned: string[] | null): Promise<void> {
  // Not supported by backend
}

// ── Knock 通知聚合（字段映射：后端 Conversation → 前端 KnockConversation） ──
function normalizeKnockConversation(c: any) {
  if (!c) return c
  return {
    ...c,
    id: c.id || c.conversationNo || c.documentId,
    unread: Number(c.unread ?? 0),
  }
}
function getKnockConversations() {
  return apiReq<{ conversations?: import('@/types/entities').KnockConversation[]; data?: any }>('/api/knock/conversations')
    .then(resp => {
      const list = Array.isArray(resp) ? resp : (resp?.conversations ?? resp?.data ?? [])
      return list.map(normalizeKnockConversation)
    })
}

function getKnockMessages(id: string, cursor?: string | null) {
  return apiReq<{ records?: import('@/types/entities').NotificationDto[]; total?: number }>(
    `/api/knock/conversations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: { conversationNo: id, limit: 50, before: cursor || null },
    },
  ).then(resp => {
    const rows = Array.isArray(resp?.records) ? resp.records.map((m: any) => normalizeNotification(m)) : []
    const total: number = (resp as any)?.total ?? rows.length
    return {
      data: rows,
      meta: { hasMore: rows.length > 0 && rows.length < total, nextCursor: null as string | null },
    }
  })
}

function normalizeNotification(m: any) {
  if (!m) return m
  return {
    documentId: m.messageNo ?? m.documentId,
    type: m.type,
    rawType: m.type,
    isRead: !!m.isRead,
    createdAt: m.createdAt,
    sender: m.sender ? {
      id: m.sender.id ?? null,
      username: m.sender.nickName ?? m.sender.userName ?? null,
      level: m.sender.level ?? null,
      author: m.sender.userNo ? { documentId: m.sender.userNo, name: m.sender.nickName ?? null, avatar: m.sender.avatar ?? null } : null,
    } : null,
    article: m.article ? {
      documentId: m.article.articleNo ?? m.article.documentId,
      title: m.article.title ?? null,
      coverAspectRatio: null,
    } : null,
    comment: m.comment ? {
      documentId: m.comment.commentNo ?? m.comment.documentId,
      content: m.comment.content ?? null,
      isAnonymous: false,
    } : null,
  }
}

function markKnockRead(id: string) {
  return apiReq(`/api/knock/conversations/${encodeURIComponent(id)}/mark-read`, { method: 'POST' })
}

// ── DM 私聊（含后端 User → DmPeer/DmMessageSender 字段映射） ──
function normalizePeer(p: any) {
  if (!p) return p
  return {
    userId: p.userNo ?? p.userId ?? p.id ?? null,
    authorDocumentId: p.userNo ?? p.authorDocumentId ?? p.documentId ?? null,
    name: p.nickName || p.name || p.userName || '',
    avatar: p.avatar ?? null,
    level: p.level ?? null,
  }
}
function normalizeSender(s: any) {
  if (!s) return s
  return {
    userId: s.userNo ?? s.userId ?? s.id ?? null,
    authorDocumentId: s.userNo ?? s.authorDocumentId ?? s.documentId ?? null,
    name: s.nickName || s.name || s.userName || '',
    avatar: s.avatar ?? null,
    level: s.level ?? null,
  }
}
function normalizeDmConversation(c: any) {
  if (!c) return c
  c.documentId = c.conversationNo ?? c.documentId
  if (c.peer) c.peer = normalizePeer(c.peer)
  c.self = {
    role: c.self?.role ?? 'member',
    muted: c.self?.muted ?? c.muted ?? false,
    pinned: c.self?.pinned ?? c.pinned ?? false,
    lastReadAt: c.self?.lastReadAt ?? c.lastReadAt ?? null,
  }
  if (c.lastMessage) {
    c.lastMessage = {
      documentId: c.lastMessage.messageNo ?? c.lastMessage.documentId,
      content: c.lastMessage.content ?? '',
      createdAt: c.lastMessage.createdAt,
      kind: c.lastMessage.kind ?? 'text',
      senderUserId: c.lastMessage.sender?.userNo ?? c.lastMessage.sender?.userId ?? null,
    }
  }
  return c
}
export function normalizeDmMessage(m: any) {
  if (!m) return m
  m.documentId = m.messageNo ?? m.documentId
  if (m.sender) m.sender = normalizeSender(m.sender)
  return m
}

function getDmConversations() {
  return apiReq<import('@/types/entities').DmConversationSummary[]>('/api/dm/conversations')
    .then(resp => {
      const list = Array.isArray(resp) ? resp : (resp?.data ?? [])
      return list.map(normalizeDmConversation)
    })
}

function postDirectConversationByDocId(targetUserDocumentId: string) {
  // 后端 createDMConversation 按 targetUserNo（userNo 字符串）查用户，这里传的就是 userNo
  return apiReq<import('@/types/entities').DmConversationSummary & { isNew?: boolean }>(
    '/api/dm/conversations/direct', { method: 'POST', query: { targetUserNo: targetUserDocumentId } },
  ).then(resp => {
    const conv = resp != null ? resp : {} as any
    const summary = normalizeDmConversation(conv)
    return { summary, isNew: !!(conv as any).isNew }
  })
}

function getDmMessages(id: string, before?: string | null) {
  return apiReq<{ records?: import('@/types/entities').DmMessage[]; total?: number }>('/api/dm/conversations/' + encodeURIComponent(id) + '/messages', {
    method: 'POST',
    body: { conversationNo: id, limit: 50, before: before || null },
  }).then(resp => {
    const rows = Array.isArray(resp?.records) ? resp.records.map(normalizeDmMessage) : Array.isArray(resp) ? resp : (resp?.data ?? [])
    const total: number = (resp as any)?.total ?? rows.length
    return {
      data: rows,
      meta: { hasMore: rows.length > 0 && rows.length < total, nextCursor: null as string | null },
    }
  })
}

function sendDmMessage(conversationId: string, payload: { content: string; kind?: string; replyTo?: string }) {
  return apiReq<import('@/types/entities').DmMessage>('/api/dm/conversations/' + encodeURIComponent(conversationId) + '/send', { method: 'POST', body: { content: payload.content, kind: payload.kind || 'text' } })
    .then(resp => normalizeDmMessage(resp != null ? resp : {} as any))
}

function editDmMessage(messageId: string, content: string) {
  // 后端暂未实现编辑消息接口（已注释），此调用会失败，不影响其它流程
  return apiReq(`/api/dm/messages/${encodeURIComponent(messageId)}`, { method: 'PATCH', body: { content } })
}

function deleteDmMessage(messageId: string) {
  return apiReq(`/api/dm/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' })
}

function markDmConversationRead(id: string) {
  return apiReq(`/api/dm/conversations/${encodeURIComponent(id)}/read`, { method: 'PATCH' })
}

function updateDmConversation(id: string, patch: { muted?: boolean; pinned?: boolean; title?: string }) {
  const body: Record<string, unknown> = {}
  if (patch.muted != null) body.muted = patch.muted
  if (patch.pinned != null) body.pinned = patch.pinned
  if (patch.title != null) body.title = patch.title
  return apiReq(`/api/dm/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body })
}

function leaveDmConversation(id: string) {
  return apiReq(`/api/dm/conversations/${encodeURIComponent(id)}/leave`, { method: 'DELETE' })
}

function getWsTicket() {
  return apiReq<{ ticket: string; ttlSec: number }>('/api/dm/socket/ticket', { method: 'POST' })
}

// ── KKCall 通话 ─────────────────────────────────────
function normalizeKkCallSession(s: any) {
  if (!s) return s
  s.documentId = s.conversationNo ?? s.documentId
  if (s.character) {
    s.character.documentId = s.character.characterNo ?? s.character.documentId
    if (typeof s.character.tags === 'string') {
      s.character.tags = s.character.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    }
  }
  return s
}
function normalizeKkCallMessage(m: any) {
  if (!m) return m
  m.documentId = m.messageNo ?? m.documentId
  return m
}

function getKkCallSessions() {
  return apiReq<import('@/types/entities').KkCallSessionSummary[]>('/api/kk-call/sessions')
    .then(resp => {
      const list = Array.isArray(resp) ? resp : (resp?.data ?? [])
      return list.map(normalizeKkCallSession)
    })
}

function getKkCallMessages(id: string, before?: string | null) {
  const query: Record<string, string> = { limit: '50' }
  if (before) query.before = before
  return apiReq<import('@/types/entities').KkCallMessage[]>(
    `/api/kk-call/sessions/${encodeURIComponent(id)}/messages`, { query },
  ).then(resp => {
    const list = Array.isArray(resp) ? resp : (resp?.data ?? [])
    return list.map(normalizeKkCallMessage)
  })
}

export function useApi() {
  return {
    login, sendRegisterCode, registerWithCode,
    searchArticles, getDiscussion, getComments, getCommentReplies, addDiscussionComment, deleteComment,
    recordArticleView, toggleLike, batchCheckLikes, markAsReadBatch,
    getProfile, getProfileArticles,
    createArticleDraft, updateArticleDraft, publishArticleDraft, deleteArticle, deleteDraft, deleteDraftCover,
    getMyDrafts, getMyDraftDetail,
    getSelfUser, getMyBusinessCards, equipBusinessCard, getMyAvatars, equipAvatar,
    updateMyName, updateMyBio, updateMyVisibility,
    uploadImage, uploadCustomAvatar,
    getPinnedArticles, updatePinnedArticles,
    getKnockConversations, getKnockMessages, markKnockRead,
    getDmConversations, postDirectConversationByDocId, getDmMessages,
    sendDmMessage, editDmMessage, deleteDmMessage,
    markDmConversationRead, updateDmConversation, leaveDmConversation,
    getWsTicket,
    getKkCallSessions, getKkCallMessages,
  }
}
