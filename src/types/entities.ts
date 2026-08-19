export interface Author {
  id?: string | number
  documentId?: string
  authorId?: string
  username?: string
  userName?: string
  nickName?: string
  login?: string
  name?: string
  email?: string
  avatar?: string
  exp?: number
  level?: number
  profileHidden?: number
  bio?: string
}

export interface CoverImage {
  documentId?: string
  url: string
  width?: number
  height?: number
}

export interface Discussion {
  id: string
  documentId?: string
  title: string
  body?: string
  bodyText?: string
  rawBodyText?: string
  covers: CoverImage[]
  cover?: string
  coverWidth?: number
  coverHeight?: number
  views?: number
  likesCount?: number
  commentsCount?: number
  isRead?: boolean | number
  liked?: boolean | number
  createdAt?: string
  updatedAt?: string
  author: Author
}

export interface CommentReply {
  id: string
  content: string
  liked?: boolean
  likesCount?: number
  createdAt?: string
  author: Author
}

export interface Comment {
  id: string
  documentId?: string
  content: string
  liked?: boolean | number
  likesCount?: number
  createdAt?: string
  author: Author
  replies: CommentReply[]
  repliesLoaded?: boolean
  hasMoreReplies?: boolean
  articleId?: string
  articleDocumentId?: string
  replyToDocumentId?: string
  articleTitle?: string
  parentContent?: string
  parentAuthorName?: string
}

export interface ProfileStats {
  articleCount: number
  commentCount: number
  totalViews: number
  totalComments: number
  totalLikes: number
}

export interface BusinessCard {
  documentId: string
  name: string
  description?: string
  type: string
  url?: string
  width?: string
  height?: string
  image?: string
  imageWidth?: number
  imageHeight?: number
}

export interface Avatar {
  documentId: string
  name?: string
  type?: string
  url?: string
  imageUrl?: string
  image?: string
  imageWidth?: number
  imageHeight?: number
  width?: number
  height?: number
}

export interface Profile {
  documentId: string
  uid?: number
  login?: string
  name?: string
  bio?: string
  avatar?: string
  level?: number
  exp?: number
  isSelf?: boolean
  isHidden?: boolean
  profileHidden?: boolean
  stats?: ProfileStats
  equippedCard?: BusinessCard
  equippedAvatar?: Avatar
}

export interface LikeToggleResult {
  liked: boolean
  likesCount: number
}

export type UploadStatus = 'pending' | 'compressing' | 'uploading' | 'done' | 'error'

export interface UploadTask {
  localId: string
  filename: string
  file: File
  status: UploadStatus
  progress: number
  previewUrl: string
  serverId?: string
  serverUrl?: string
  error?: string
}

export interface DraftArticle {
  documentId: string
  title: string
  text: string
  cover?: CoverImage[]
  hasPublishedVersion: boolean
  createdAt?: string
  updatedAt?: string
  author?: Author
}

export interface UploadedFile {
  id: number
  documentId: string
  url: string
  width?: number
  height?: number
}

// ── Knock Knock（敲敲）相关 ──────────────────────────

export type NotificationType =
  | "comment"
  | "reply"
  | "like"
  | "favorite"
  | "mention"
  | "system"

export interface NotificationSenderAvatar {
  url: string
  width?: number
  height?: number
}

export interface NotificationSenderAuthor {
  documentId: string | null
  name: string | null
  avatar: NotificationSenderAvatar | null
}

export interface NotificationSender {
  id: number | null
  username: string | null
  level: number | null
  author: NotificationSenderAuthor | null
}

export interface NotificationArticleRef {
  documentId: string
  title: string
  coverAspectRatio: number | null
}

export interface NotificationCommentRef {
  documentId: string
  content: string
  isAnonymous: boolean
}

export interface NotificationDto {
  documentId: string
  type: NotificationType
  rawType?: NotificationType
  isRead: boolean
  createdAt: string
  sender: NotificationSender | null
  article: NotificationArticleRef | null
  comment: NotificationCommentRef | null
}

export type KnockCategory = "contacts" | "anonymous" | "other"

export interface KnockConversation {
  category: KnockCategory
  id: string
  peerKey: string
  peerName: string
  peerAvatar: string | null
  unread: number
  lastPreview: string
  lastAt: string
  lastType: NotificationType
}

export type KnockSseEventType =
  | "notification.created"
  | "notification.read"
  | "notification.read.bulk"

export interface KnockSseEvent {
  type: KnockSseEventType
  conversationId?: string
  notificationId?: string
  count?: number
  at: string
}

// ── DM 私聊（真实双向）相关 ──────────────────────────

export type DmConversationKind = "direct" | "group"
export type DmMemberRole = "owner" | "admin" | "member"

export type DmMessageKind = "text" | "image" | "system" | "notification"

export type DmNotificationKind =
  | "like"
  | "favorite"
  | "comment"
  | "reply"
  | "mention"
  | "system"

export type DmPseudoConversationId =
  | `pseudo:user:${string}`
  | `pseudo:anonymous:${string}`
  | "pseudo:system"

export interface DmPeer {
  userId: string
  authorDocumentId: string
  name: string
  avatar: string | null
  level: number | null
}

export interface DmSelfState {
  role: DmMemberRole
  muted: boolean
  pinned: boolean
  lastReadAt: string | null
}

export interface DmLastMessagePreview {
  documentId: string
  content: string
  createdAt: string
  kind: DmMessageKind
  senderUserId: string | null
}

export interface DmConversationSummary {
  documentId: string
  kind: DmConversationKind
  title: string | null
  avatar: string | null
  peer: DmPeer | null
  memberCount: number
  lastMessageAt: string | null
  lastMessage: DmLastMessagePreview | null
  unreadCount: number
  self: DmSelfState
  pseudoKind?: "user" | "anonymous" | "system" | null
}

export interface DmMessageSender {
  userId: string
  authorDocumentId: string | null
  name: string
  avatar: string | null
  level: number | null
}

export interface DmMessageReplyTo {
  documentId: string
  content: string | null
  senderUserId: string | null
}

export interface DmNotificationArticleRef {
  documentId: string
  title: string
  coverAspectRatio?: number
}

export interface DmNotificationCommentRef {
  documentId: string
  content: string
  isAnonymous: boolean
}

export interface DmMessage {
  documentId: string
  kind: DmMessageKind
  content: string | null
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  sender: DmMessageSender | null
  replyTo: DmMessageReplyTo | null
  isSelf?: boolean
  notificationKind?: DmNotificationKind
  notificationDocumentId?: string
  notificationRead?: boolean
  article?: DmNotificationArticleRef | null
  comment?: DmNotificationCommentRef | null
}

export type DmWsEventType =
  | "hello"
  | "pong"
  | "message.created"
  | "message.edited"
  | "message.deleted"
  | "conversation.read"
  | "conversation.updated"
  | "conversation.member.removed"
  | "typing"
  | "error"

export interface DmWsEvent<TData = unknown> {
  type: DmWsEventType
  conversationId?: string
  messageId?: string
  data?: TData
  at: string
}

// ── KKCall（敲敲通话）相关 ───────────────────────────

export interface KkCallCharacter {
  documentId: string
  name: string
  avatar: string | null
  tagline: string
  tags: string[]
  displayOrder: number
}

export interface KkCallSessionSummary {
  documentId: string
  isPseudo: boolean
  character: KkCallCharacter
  lastMessageAt: string | null
  lastPreview: string
}

export interface KkCallMessage {
  documentId: string
  role: "user" | "assistant"
  content: string
  pending: boolean
  errorReason: string | null
  createdAt: string
}

export type KkCallSseEventType =
  | "session.materialized"
  | "message.user.created"
  | "message.assistant.started"
  | "message.assistant.delta"
  | "message.assistant.done"
  | "error"
