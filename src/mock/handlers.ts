import type { ApiEnvelope } from '@/types/api'
import type { Discussion, Comment, Profile, BusinessCard, Avatar, DraftArticle } from '@/types/entities'
import {
  mockArticles, mockComments, mockUsers, selfUser,
  mockBusinessCards, mockAvatars, mockDrafts,
  articleLikes, commentLikes, readArticles, getMockProfile,
} from './data'
import { parseStart, buildPagination, DEFAULT_PAGE_SIZE } from '@/utils/pagination'

type MockHandler = (params: { url: URL; request: Request }) => Promise<unknown>

function ok<T>(data: T) { return { code: 1, msg: 'success', data } }
function fail(msg: string) { return { code: 0, msg } }

function getAuthUserId(request: Request): string | null {
  const auth = request.headers.get('Authorization') || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? selfUser.documentId! : null
}

// ───────────────────────────────────────────────────
// 1. Articles
// ───────────────────────────────────────────────────

const articleList: Handler = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '0')
  const pageSize = parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))
  const start = page * pageSize
  const nodes = mockArticles.slice(start, start + pageSize)
  return ok({
    total: mockArticles.length,
    list: nodes.map(a => ({
      ...a,
      isRead: readArticles.has(a.id),
      liked: articleLikes.has(a.id),
    })),
  })
}

const articleSearch: Handler = async ({ url }) => {
  const q = (url.searchParams.get('q') || '').toLowerCase()
  const page = parseInt(url.searchParams.get('page') || '0')
  const pageSize = parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))
  const filtered = q ? mockArticles.filter(a =>
    a.title.toLowerCase().includes(q) || a.bodyText?.toLowerCase().includes(q)
  ) : mockArticles
  const start = page * pageSize
  const nodes = filtered.slice(start, start + pageSize)
  return ok({
    total: filtered.length,
    list: nodes.map(a => ({
      ...a,
      isRead: readArticles.has(a.id),
      liked: articleLikes.has(a.id),
    })),
  })
}

const articleDetail: Handler = async ({ url }) => {
  const id = url.pathname.split('/').pop()!
  const article = mockArticles.find(a => a.id === id)
  if (!article) return fail('文章不存在')
  return ok({
    ...article,
    liked: articleLikes.has(article.id),
    images: article.covers,
  })
}

const articleView: Handler = async ({ url }) => {
  const id = url.pathname.split('/')[3]
  const article = mockArticles.find(a => a.id === id)
  if (!article) return fail('文章不存在')
  article.views = (article.views || 0) + 1
  return ok({ views: article.views })
}

const articleCreateDraft: Handler = async ({ request }) => {
  const body = await request.json()
  const draft: DraftArticle = {
    documentId: `draft_${Date.now()}`,
    title: body.title || '',
    text: body.text || '',
    cover: body.images?.map((i: { imageId: number }) => ({ url: '', documentId: String(i.imageId) })) || [],
    hasPublishedVersion: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: selfUser,
  }
  mockDrafts.unshift(draft)
  return ok({ Id: draft.documentId })
}

const articleUpdateDraft: Handler = async ({ url, request }) => {
  const id = url.pathname.split('/')[3]
  const body = await request.json()
  const draft = mockDrafts.find(d => d.documentId === id)
  if (!draft) return fail('草稿不存在')
  if (body.title) draft.title = body.title
  if (body.text) draft.text = body.text
  draft.updatedAt = new Date().toISOString()
  return ok({
    title: draft.title,
    text: draft.text,
    images: draft.cover?.map(c => ({ image: c.url })),
    updateTime: draft.updatedAt,
  })
}

const articlePublish: Handler = async ({ url }) => {
  const id = url.pathname.split('/')[3]
  const draft = mockDrafts.find(d => d.documentId === id)
  if (!draft) return fail('草稿不存在')
  const newArticle: Discussion = {
    id: String(Date.now()),
    title: draft.title,
    body: draft.text,
    bodyText: draft.text,
    rawBodyText: draft.text,
    covers: draft.cover || [],
    views: 0, likesCount: 0, commentsCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: selfUser,
  }
  mockArticles.unshift(newArticle)
  mockDrafts.splice(mockDrafts.indexOf(draft), 1)
  return ok({})
}

const articleDelete: Handler = async ({ url }) => {
  const id = url.pathname.split('/')[3]
  const idx = mockArticles.findIndex(a => a.id === id)
  if (idx >= 0) { mockArticles.splice(idx, 1); return ok({}) }
  const didx = mockDrafts.findIndex(d => d.documentId === id)
  if (didx >= 0) { mockDrafts.splice(didx, 1); return ok({}) }
  return fail('文章不存在')
}

const myArticles: Handler = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '0')
  const pageSize = parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))
  const mine = mockArticles.filter(a => a.author.documentId === selfUser.documentId).slice(page * pageSize, (page + 1) * pageSize)
  return ok(mine.map(a => ({
    id: a.id, title: a.title, text: a.bodyText,
    createTime: a.createdAt, updateTime: a.updatedAt,
    total: mockArticles.filter(x => x.author.documentId === selfUser.documentId).length,
  })))
}

const myArticleDetail: Handler = async ({ url }) => {
  const id = url.pathname.split('/').pop()!
  const article = mockArticles.find(a => a.id === id && a.author.documentId === selfUser.documentId)
  if (!article) return fail('文章不存在')
  return ok({
    ...article,
    liked: articleLikes.has(article.id),
    images: article.covers,
  })
}

const myDraftsList: Handler = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '1') - 1
  const pageSize = parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))
  const start = page * pageSize
  const nodes = mockDrafts.slice(start, start + pageSize).map(d => ({
    documentId: d.documentId,
    title: d.title,
    text: d.text,
    userDocumentId: selfUser.documentId,
    hasPublishedVersion: d.hasPublishedVersion,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }))
  return ok({ total: mockDrafts.length, rows: nodes })
}

const myDraftDetail: Handler = async ({ url }) => {
  const id = url.pathname.split('/').pop()!
  const draft = mockDrafts.find(d => d.documentId === id)
  if (!draft) return fail('草稿不存在')
  return ok(draft)
}

const deleteDraft: Handler = async ({ url }) => {
  const id = url.pathname.split('/').pop()!
  const idx = mockDrafts.findIndex(d => d.documentId === id)
  if (idx >= 0) { mockDrafts.splice(idx, 1); return ok({}) }
  return fail('草稿不存在')
}

// ───────────────────────────────────────────────────
// 2. Comments
// ───────────────────────────────────────────────────

const commentList: Handler = async ({ url, request }) => {
  const articleId = url.searchParams.get('articleId') || ''
  const page = parseInt(url.searchParams.get('page') || '0')
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10')
  let comments = mockComments.get(articleId) || []
  const userId = getAuthUserId(request)
  const start = page * pageSize
  const nodes = comments.slice(start, start + pageSize).map(c => ({
    ...c,
    liked: userId ? commentLikes.has(c.id) : undefined,
  }))
  return ok({
    list: nodes,
    total: comments.length,
    ...nodes[0] ? { id: nodes[0].id } : {},
  })
}

const commentCreate: Handler = async ({ request }) => {
  const body = await request.json()
  const data = body.data || body
  const newComment: Comment = {
    id: `cmt_${Date.now()}`,
    content: data.content || '',
    liked: false,
    likesCount: 0,
    createdAt: new Date().toISOString(),
    author: selfUser,
    replies: [],
    articleId: data.articleId,
  }
  const existing = mockComments.get(data.articleId) || []
  existing.unshift(newComment)
  mockComments.set(data.articleId, existing)
  return ok({ data: newComment })
}

const commentDelete: Handler = async ({ url }) => {
  const id = url.pathname.split('/').pop()!
  for (const [articleId, comments] of mockComments) {
    const idx = comments.findIndex(c => c.id === id)
    if (idx >= 0) { comments.splice(idx, 1); return ok({}) }
    for (const c of comments) {
      const ridx = c.replies.findIndex(r => r.id === id)
      if (ridx >= 0) { c.replies.splice(ridx, 1); return ok({}) }
    }
  }
  return fail('评论不存在')
}

// ───────────────────────────────────────────────────
// 3. Likes
// ───────────────────────────────────────────────────

const likeToggle: Handler = async ({ request }) => {
  const body = await request.json()
  const { targetType, targetId } = body
  const set = targetType === 'article' ? articleLikes : commentLikes
  const liked = set.has(targetId)
  if (liked) set.delete(targetId)
  else set.add(targetId)
  const counts: Record<string, number> = {}
  for (const id of set) counts[id] = (counts[id] || 0) + 1
  return ok({ liked: !liked, likedCount: set.size })
}

const likeCheck: Handler = async ({ url }) => {
  const targetType = url.searchParams.get('targetType') || 'article'
  const ids = (url.searchParams.get('targetIds') || '').split(',').filter(Boolean)
  const set = targetType === 'article' ? articleLikes : commentLikes
  const data: Record<string, boolean> = {}
  for (const id of ids) data[id] = set.has(id)
  return ok(data)
}

// ───────────────────────────────────────────────────
// 4. Read
// ───────────────────────────────────────────────────

const articleReads: Handler = async ({ request }) => {
  const body = await request.json()
  const ids: string[] = body.articleIds || body.articleDocumentIds || []
  if (body.markAsRead) {
    for (const id of ids) readArticles.add(id)
    return ok({})
  }
  return ok(ids.map((id: string) => ({ articleId: id, isRead: readArticles.has(id) })))
}

// ───────────────────────────────────────────────────
// 5. Upload
// ───────────────────────────────────────────────────

const mediaUpload: Handler = async () => {
  const docId = `cover_${Date.now()}`
  return ok({
    documentId: docId,
    url: '',
    fileName: 'mock-file.jpg',
    fileType: 'article_cover',
    size: 12345,
    width: 1920,
    height: 1080,
    createTime: new Date().toISOString(),
  })
}

// ───────────────────────────────────────────────────
// 6. Me
// ───────────────────────────────────────────────────

const meProfile: Handler = async () => {
  return ok({
    id: selfUser.id,
    documentId: [selfUser.documentId],
    userName: selfUser.username,
    nickName: selfUser.name,
    email: selfUser.email || '',
    avatar: selfUser.avatar || '',
    exp: selfUser.exp,
    level: selfUser.level,
    bio: '这是一个绳网用户。',
    profileHidden: false,
  })
}

const meCards: Handler = async () => {
  return ok({
    cards: mockBusinessCards,
    equippedCardId: mockBusinessCards[0]?.documentId || null,
    equippedCard: mockBusinessCards[0] || null,
  })
}

const meCardEquip: Handler = async ({ request }) => {
  const body = await request.json()
  return ok({ equippedCardId: body.id })
}

const meAvatarUpload: Handler = async ({ request }) => {
  const body = await request.json()
  return ok({
    id: body.fileId,
    name: '自定义头像',
    type: 'image',
    url: '',
    imageWidth: 256,
    imageHeight: 256,
  })
}

const meUpdateName: Handler = async ({ request }) => {
  const body = await request.json()
  selfUser.name = body.name
  return ok({ name: body.name })
}

const meUpdateBio: Handler = async ({ request }) => {
  const body = await request.json()
  return ok({ bio: body.bio })
}

const meUpdateVisibility: Handler = async ({ request }) => {
  const body = await request.json()
  return ok({ profileHidden: body.profileHidden })
}

// ───────────────────────────────────────────────────
// 7. Profile
// ───────────────────────────────────────────────────

const getProfile: Handler = async ({ url }) => {
  const id = url.pathname.split('/').pop()!
  return ok(getMockProfile(id))
}

const getProfileArticles: Handler = async ({ url }) => {
  const id = url.pathname.split('/')[3]
  const articles = mockArticles.filter(a => a.author.documentId === id)
  const page = parseInt(url.searchParams.get('page') || '1')
  const pageSize = parseInt(url.searchParams.get('pageSize') || '6')
  const start = (page - 1) * pageSize
  return ok(buildPagination(articles.slice(start, start + pageSize), start, { start, limit: pageSize, total: articles.length }))
}

// ───────────────────────────────────────────────────
// 8. Auth
// ───────────────────────────────────────────────────

const storedRegCodes = new Map<string, { code: string; expires: number }>()

const authLogin: Handler = async ({ request }) => {
  const body = await request.json()
  const user = mockUsers.find(u => u.email === body.identifier || u.username === body.identifier)
  if (!user) return fail('用户不存在')
  return ok({
    jwt: `mock-jwt-${user.documentId}-${Date.now()}`,
    user: {
      id: user.id,
      documentId: user.documentId,
      userName: user.username,
      nickName: user.name,
      email: user.email,
      avatar: user.avatar,
      exp: user.exp,
      level: user.level,
    },
  })
}

const authSendCode: Handler = async ({ request }) => {
  const body = await request.json()
  const code = String(Math.floor(100000 + Math.random() * 900000))
  storedRegCodes.set(body.email, { code, expires: Date.now() + 600000 })
  return ok({
    email: body.email,
    sent: true,
    expiresIn: 600,
    cooldown: 60,
  })
}

const authRegister: Handler = async ({ request }) => {
  const body = await request.json()
  const stored = storedRegCodes.get(body.email)
  if (!stored || stored.expires < Date.now()) return fail('验证码已过期')
  if (stored.code !== body.code) return fail('验证码错误')
  storedRegCodes.delete(body.email)
  const newUser: Author = {
    id: mockUsers.length + 1,
    documentId: `usr_${Date.now()}`,
    username: body.email.split('@')[0],
    name: body.email.split('@')[0],
    email: body.email,
    avatar: '',
    exp: 0,
    level: 1,
  }
  mockUsers.push(newUser)
  return ok({
    jwt: `mock-jwt-${newUser.documentId}-${Date.now()}`,
    user: {
      id: newUser.id,
      documentId: newUser.documentId,
      userName: newUser.username,
      nickName: newUser.name,
      email: newUser.email,
      avatar: newUser.avatar,
      exp: newUser.exp,
      level: newUser.level,
    },
  })
}

const authRenew: Handler = async () => {
  return ok({ jwt: `mock-jwt-renewed-${Date.now()}` })
}

// ───────────────────────────────────────────────────
// Route table
// ───────────────────────────────────────────────────

interface RouteEntry {
  pattern: string | RegExp
  method: string
  handler: MockHandler
}

function matchPath(pattern: string | RegExp, pathname: string): Record<string, string> | null {
  if (typeof pattern === 'string') {
    const pParts = pattern.split('/')
    const uParts = pathname.split('/')
    if (pParts.length !== uParts.length) return null
    const params: Record<string, string> = {}
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) {
        params[pParts[i].slice(1)] = uParts[i]
      } else if (pParts[i] !== uParts[i]) {
        return null
      }
    }
    return params
  }
  const match = pathname.match(pattern)
  return match ? match.groups || {} : null
}

export const routes: RouteEntry[] = [
  // Articles
  { pattern: '/api/articles/search', method: 'GET', handler: articleSearch },
  { pattern: '/api/articles/my/detail/:id', method: 'GET', handler: myArticleDetail },
  { pattern: '/api/articles/my/articles', method: 'GET', handler: myArticles },
  { pattern: '/api/articles/my/drafts/:id', method: 'GET', handler: myDraftDetail },
  { pattern: '/api/articles/my/drafts/:id', method: 'DELETE', handler: deleteDraft },
  { pattern: '/api/articles/my/drafts', method: 'GET', handler: myDraftsList },
  { pattern: '/api/articles/detail/:id', method: 'GET', handler: articleDetail },
  { pattern: '/api/articles/:id/view', method: 'POST', handler: articleView },
  { pattern: '/api/articles/:id/publish', method: 'POST', handler: articlePublish },
  { pattern: '/api/articles/:id', method: 'PUT', handler: articleUpdateDraft },
  { pattern: '/api/articles/:id', method: 'DELETE', handler: articleDelete },
  { pattern: '/api/articles', method: 'POST', handler: articleCreateDraft },
  { pattern: '/api/articles', method: 'GET', handler: articleList },
  // Comments
  { pattern: '/api/comments/list', method: 'GET', handler: commentList },
  { pattern: '/api/comments/:id', method: 'DELETE', handler: commentDelete },
  { pattern: '/api/comments', method: 'POST', handler: commentCreate },
  // Likes
  { pattern: '/api/likes/toggle', method: 'POST', handler: likeToggle },
  { pattern: '/api/likes/check', method: 'GET', handler: likeCheck },
  // Read
  { pattern: '/api/article-reads', method: 'POST', handler: articleReads },
  // Upload
  { pattern: '/api/media/upload', method: 'POST', handler: mediaUpload },
  // Me
  { pattern: '/api/me/cards/equip', method: 'PUT', handler: meCardEquip },
  { pattern: '/api/me/avatar/upload', method: 'PUT', handler: meAvatarUpload },
  { pattern: '/api/me/profile/name', method: 'PUT', handler: meUpdateName },
  { pattern: '/api/me/profile/bio', method: 'PUT', handler: meUpdateBio },
  { pattern: '/api/me/profile/visibility', method: 'PUT', handler: meUpdateVisibility },
  { pattern: '/api/me/cards', method: 'GET', handler: meCards },
  { pattern: '/api/me/profile', method: 'GET', handler: meProfile },
  // Profile
  { pattern: '/api/profile/:id/articles', method: 'GET', handler: getProfileArticles },
  { pattern: '/api/profiles/:id', method: 'GET', handler: getProfile },
  { pattern: '/api/profile/:id', method: 'GET', handler: getProfile },
  // Auth
  { pattern: '/api/auth/send-register-code', method: 'POST', handler: authSendCode },
  { pattern: '/api/auth/register-with-code', method: 'POST', handler: authRegister },
  { pattern: '/api/auth/renew', method: 'POST', handler: authRenew },
  { pattern: '/api/auth/local', method: 'POST', handler: authLogin },
]

export function findHandler(pathname: string, method: string): MockHandler | null {
  for (const route of routes) {
    if (route.method !== method.toUpperCase()) continue
    const params = matchPath(route.pattern, pathname)
    if (params !== null) return route.handler
  }
  return null
}
