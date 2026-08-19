import type { Discussion, Comment, Author, Profile, BusinessCard, Avatar, DraftArticle } from '@/types/entities'

let nextId = 1000
function uid(): string { return String(++nextId) }
function nid(): number { return ++nextId }

// ── Users ──────────────────────────────────────────
export const mockUsers: Author[] = [
  { id: 1, documentId: 'usr_001', username: 'proxy', name: '传奇绳匠', avatar: '', exp: 2500, level: 8, email: 'proxy@example.com' },
  { id: 2, documentId: 'usr_002', username: 'wise', name: 'Wise', avatar: '', exp: 1800, level: 6, email: 'wise@example.com' },
  { id: 3, documentId: 'usr_003', username: 'belle', name: 'Belle', avatar: '', exp: 3200, level: 9, email: 'belle@example.com' },
  { id: 4, documentId: 'usr_004', username: 'nicole', name: '妮可·德玛拉', avatar: '', exp: 4200, level: 11, email: 'nicole@example.com' },
  { id: 5, documentId: 'usr_005', username: 'anby', name: '安比·德玛拉', avatar: '', exp: 5600, level: 14, email: 'anby@example.com' },
  { id: 6, documentId: 'usr_006', username: 'billy', name: '比利·基德', avatar: '', exp: 1200, level: 4, email: 'billy@example.com' },
  { id: 7, documentId: 'usr_007', username: 'nekomata', name: '猫宫又', avatar: '', exp: 8900, level: 22, email: 'neko@example.com' },
]

// Current logged-in user
export const selfUser: Author = { ...mockUsers[0], authorId: mockUsers[0].documentId }

// ── Cover images for mock articles ─────────────────
const coverPool = [
  { url: '', width: 1920, height: 1080 },
  { url: '', width: 1080, height: 1350 },
  { url: '', width: 1600, height: 900 },
  { url: '', width: 900, height: 1600 },
  { url: '', width: 1200, height: 1200 },
  { url: '', width: 1920, height: 1280 },
  { url: '', width: 800, height: 1200 },
  { url: '', width: 1440, height: 900 },
]

// ── Article titles ─────────────────────────────────
const titles = [
  '空洞探索指南：新手必读',
  '六分街的秘密——你不知道的隐藏任务',
  '最强音擎搭配攻略 2026',
  '绳匠入门：从零开始掌握战斗技巧',
  '空洞深处的未知领域探索记录',
  '关于新空洞怪物的战斗策略分析',
  '如何高效刷取丁尼？老玩家的心得分享',
  '新空洞"零号空洞"全BOSS打法攻略',
  '光映广场隐藏宝箱位置大全',
  '邦布的选择——哪种邦布最适合你？',
  '空洞裂隙的机制详解与应对策略',
  '绳网近期更新内容大盘点',
  '挑战空洞高难的心得与装备推荐',
  '新手如何快速升级绳匠等级？',
  '空洞探索中的小心得与小技巧',
  '关于空洞怪物的弱点属性分析',
  '我的空洞十日谈——探索记录与感悟',
  '空洞掉落物品价值排行',
  '空洞探索武器装备全解析',
  '空洞补给站的最佳使用时机',
  '空洞探索队形搭配推荐',
  '新地图"旧都废墟"探索指南',
  '绳匠升级经验获取途径汇总',
  '空洞探索中的资源管理技巧',
  '空洞精英怪的刷新机制研究',
  '探索小队阵容配置深度分析',
  '空洞装备强化材料的获取攻略',
  '空洞探索的注意事项与避坑指南',
  '从萌新到大神——我的绳网成长之路',
  '空洞BOSS"暗影猎手"的无伤打法',
  '空洞探索最佳路线规划',
  '关于空洞生态系统的猜想与分析',
  '空洞探索中的隐藏要素汇总',
  '如何利用空洞地形优势战斗？',
  '空洞探索中的音擎搭配心得',
  '新人必看的空洞基础知识讲解',
  '空洞探索中的团队协作要点',
  '新空洞"深渊裂隙"初见体验',
  '空洞探索中容易被忽略的细节',
  '我的绳网生涯：回忆与展望',
  '空洞探索数据统计与分析',
  '空洞挑战模式高分技巧分享',
  '关于空洞剧情的猜测与讨论',
  '空洞中的随机事件触发条件',
  '空洞探索的效率提升方法',
  '最适合新手的五个空洞探索技巧',
  '空洞探索中的隐藏对话触发条件',
  '空洞BOSS伤害机制深度解析',
  '高难空洞通关后的奖励一览',
  '空洞探索工具的使用技巧分享',
]

const bodies = [
  '最近在空洞中探索时发现了一些有趣的现象，分享给大家。\n\n空洞中的怪物行为模式似乎与地形有一定关联，在狭窄区域更容易遇到高等级怪物。建议大家组队时带上至少一名远程角色。\n\n以下是我整理的几个要点：\n\n1. **地形影响**：开阔地带怪物刷新率较低，适合休整\n2. **时间因素**：空洞中的"夜晚"时段怪物攻击性更强\n3. **装备建议**：推荐携带至少一件抗性装备',
  '今天想和大家聊聊关于空洞探索的一些心得体会。\n\n作为一个从开服玩到现在的老玩家，我经历了无数次翻车和重来，终于总结出了一套比较稳定的打法。\n\n## 核心思路\n\n空洞探索的核心在于**资源管理**和**队伍搭配**。很多人只顾着堆输出，却忽略了生存能力的重要性。\n\n> 记住：活着的输出才有输出。\n\n希望这些经验对大家有帮助！',
  '分享一下我的最新发现！\n\n在光映广场的某个角落，我发现了一个非常隐蔽的入口，进入后竟然是一个全新的空洞区域！\n\n里面有不少稀有材料，还有一只特殊的邦布可以互动。有兴趣的朋友可以去看看，具体位置就不透露了，给大家留一些探索的乐趣~',
  '测试了多种音擎搭配方案后，终于找到了最优解。\n\n| 方案 | 输出 | 生存 | 推荐度 |\n|------|------|------|--------|\n| 方案A | S | A | ★★★★★ |\n| 方案B | A+ | S | ★★★★ |\n| 方案C | S+ | B | ★★★ |\n\n以上数据基于实战测试，仅供参考。',
  '空洞中的风景真的很美，每次探索都像是一次新的冒险。\n\n虽然有时候会遇到困难，但正是这些挑战让游戏变得更加有趣。希望大家也能在空洞中找到属于自己的乐趣！',
]

// ── Generate Articles ──────────────────────────────
function generateArticle(idx: number): Discussion {
  const author = mockUsers[idx % mockUsers.length]
  const coverInfo = coverPool[idx % coverPool.length]
  const daysAgo = Math.floor(idx * 1.5) + 1
  const date = new Date(Date.now() - daysAgo * 86400000)
  const views = Math.floor(100 + Math.random() * 10000)
  const likes = Math.floor(Math.random() * 500)
  const comments = Math.floor(Math.random() * 50)

  return {
    id: uid(),
    title: titles[idx % titles.length],
    body: `<p>${bodies[idx % bodies.length].replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
    bodyText: bodies[idx % bodies.length],
    rawBodyText: bodies[idx % bodies.length],
    covers: coverInfo.url ? [{ url: coverInfo.url, width: coverInfo.width, height: coverInfo.height }] : [],
    cover: coverInfo.url || undefined,
    coverWidth: coverInfo.width,
    coverHeight: coverInfo.height,
    views,
    likesCount: likes,
    commentsCount: comments,
    isRead: idx < 3,
    liked: idx % 5 === 0,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    author: { ...author },
  }
}

export const mockArticles: Discussion[] = Array.from({ length: 55 }, (_, i) => generateArticle(i))

// ── Generate Comments ───────────────────────────────
function generateComment(articleId: string, idx: number): Comment {
  const author = mockUsers[(idx + 1) % mockUsers.length]
  const replies: Comment['replies'] = idx % 3 === 0 ? [
    {
      id: uid(),
      content: '说得太对了！我也这么觉得。',
      liked: false,
      likesCount: Math.floor(Math.random() * 20),
      createdAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      author: { ...mockUsers[(idx + 3) % mockUsers.length] },
    },
    {
      id: uid(),
      content: '感谢分享，学到了很多。',
      liked: true,
      likesCount: Math.floor(Math.random() * 15) + 1,
      createdAt: new Date(Date.now() - Math.random() * 43200000).toISOString(),
      author: { ...mockUsers[(idx + 4) % mockUsers.length] },
    },
  ] : []

  return {
    id: uid(),
    content: ['写得太好了！', '学到了', '支持！', '干货满满', '期待更多分享', 'MARK一下'][idx % 6],
    liked: idx % 4 === 0,
    likesCount: Math.floor(Math.random() * 30),
    createdAt: new Date(Date.now() - Math.random() * 172800000).toISOString(),
    author: { ...author },
    replies,
    articleId,
  }
}

// Pre-generate comments for first 10 articles
export const mockComments: Map<string, Comment[]> = new Map()
for (let i = 0; i < 10; i++) {
  const article = mockArticles[i]
  const count = 3 + Math.floor(Math.random() * 8)
  mockComments.set(article.id, Array.from({ length: count }, (_, j) => generateComment(article.id, j)))
}

// ── Business Cards ──────────────────────────────────
export const mockBusinessCards: BusinessCard[] = [
  { documentId: 'card_001', name: '绳匠', description: '传说中的绳匠', type: 'character', image: '', imageWidth: 400, imageHeight: 700 },
  { documentId: 'card_002', name: '空洞探险家', description: '空洞中的探险者', type: 'character', image: '', imageWidth: 400, imageHeight: 700 },
  { documentId: 'card_003', name: '六分街守护者', description: '守护六分街的英雄', type: 'city', image: '', imageWidth: 400, imageHeight: 700 },
  { documentId: 'card_004', name: '邦布爱好者', description: '邦布邦布！', type: 'character', image: '', imageWidth: 400, imageHeight: 700 },
  { documentId: 'card_005', name: '旧都往事', description: '旧都的记忆', type: 'news', image: '', imageWidth: 400, imageHeight: 700 },
  { documentId: 'card_006', name: '新艾利都', description: '新艾利都的风景', type: 'city', image: '', imageWidth: 400, imageHeight: 700 },
]

// ── Avatars ────────────────────────────────────────
export const mockAvatars: Avatar[] = [
  { documentId: 'avt_001', name: '绳匠头像', type: 'character', image: '', imageWidth: 256, imageHeight: 256 },
  { documentId: 'avt_002', name: '空洞头像', type: 'character', image: '', imageWidth: 256, imageHeight: 256 },
  { documentId: 'avt_003', name: '六分街头像', type: 'city', image: '', imageWidth: 256, imageHeight: 256 },
  { documentId: 'avt_004', name: '邦布头像', type: 'character', image: '', imageWidth: 256, imageHeight: 256 },
  { documentId: 'avt_005', name: '旧都头像', type: 'news', image: '', imageWidth: 256, imageHeight: 256 },
]

// ── Drafts ─────────────────────────────────────────
export const mockDrafts: DraftArticle[] = [
  {
    documentId: 'draft_001',
    title: '未完成的空洞攻略',
    text: '这篇攻略还在编写中...',
    cover: [],
    hasPublishedVersion: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    author: selfUser,
  },
  {
    documentId: 'draft_002',
    title: '邦布培养心得',
    text: '邦布的选择和培养需要根据队伍需求来决定...',
    cover: [{ url: '', width: 1920, height: 1080 }],
    hasPublishedVersion: false,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
    author: selfUser,
  },
]

// ── Like state ─────────────────────────────────────
export const articleLikes = new Set<string>(mockArticles.filter((_, i) => i % 5 === 0).map(a => a.id))
export const commentLikes = new Set<string>()

// ── Read state ─────────────────────────────────────
export const readArticles = new Set<string>(mockArticles.slice(0, 3).map(a => a.id))

// ── Profile ────────────────────────────────────────
export function getMockProfile(userId: string): Profile {
  const user = mockUsers.find(u => u.documentId === userId) || mockUsers[0]
  return {
    documentId: user.documentId!,
    uid: typeof user.id === 'number' ? user.id : parseInt(String(user.id)) || 1,
    login: user.username,
    name: user.name,
    bio: '这是一个绳网用户。热衷于空洞探索，乐于分享游戏心得和攻略。',
    avatar: user.avatar,
    level: user.level,
    exp: user.exp,
    isSelf: userId === selfUser.documentId,
    isHidden: false,
    profileHidden: false,
    stats: {
      articleCount: Math.floor(Math.random() * 20) + 5,
      commentCount: Math.floor(Math.random() * 100) + 10,
      totalViews: Math.floor(Math.random() * 50000) + 1000,
      totalComments: Math.floor(Math.random() * 500) + 50,
      totalLikes: Math.floor(Math.random() * 2000) + 100,
    },
    equippedCard: mockBusinessCards[0],
    equippedAvatar: mockAvatars[0],
  }
}
