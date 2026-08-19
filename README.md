# 绳网 (InterKnot) - 前端

绳网是一个游戏、技术交流社区平台，灵感来源于《绝区零》中的"绳网"——新艾利都最大的匿名委托中心。你可以在这里发现并分享有趣的内容。本仓库为其前端工程，配套后端见https://github.com/javvvy/InterKnot-Web。

## 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [页面与路由](#页面与路由)
- [核心功能](#核心功能)
- [数据请求与字段映射](#数据请求与字段映射)
- [认证机制](#认证机制)
- [实时通信](#实时通信)
- [环境依赖](#环境依赖)
- [快速开始](#快速开始)
- [开发代理配置](#开发代理配置)
- [Mock 数据](#mock-数据)
- [注意事项](#注意事项)

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | Vue 3.5 + TypeScript 5.9（strict） |
| 构建工具 | Vite 6 |
| 状态管理 | Pinia 3 |
| 路由 | Vue Router 4 |
| UI 组件库 | zenless-ui（绝区零主题，本地 workspace 依赖） |
| 图标 | @heroicons/vue |
| 组合式工具 | @vueuse/core |
| HTTP 客户端 | 原生 fetch 封装（`useApi`）、ofetch |
| Markdown 渲染 | markdown-it + isomorphic-dompurify（XSS 白名单过滤） |
| 工具库 | throttle-debounce |
| 样式 | Sass (SCSS) |
| 包管理器 | pnpm |

## 项目结构

```
src/
├── main.ts                  # 应用入口（挂载 Vue / Pinia / Router / zenless-ui）
├── App.vue                  # 根组件
├── pages/                   # 页面组件
│   ├── HomePage.vue             # 首页（瀑布流帖子）
│   ├── CreatePage.vue           # 发帖 / 草稿编辑
│   ├── DiscussionDetailPage.vue # 帖子详情页
│   ├── ProfilePage.vue          # 用户个人主页
│   └── KnockPage.vue            # 通知 / 敲敲页面
├── components/              # 可复用组件
│   ├── AppHeader.vue            # 顶部导航栏
│   ├── MobileBottomNav.vue      # 移动端底部导航
│   ├── DiscussionCard.vue       # 帖子卡片
│   ├── DiscussionCardSkeleton.vue # 帖子卡片骨架屏
│   ├── DiscussionOverlay.vue    # 帖子详情弹窗
│   ├── CommentItem.vue          # 评论组件
│   ├── LoginDialog.vue          # 登录 / 注册弹窗
│   ├── KkCallPanel.vue          # AI 通话面板
│   ├── KkCallSessionList.vue    # AI 通话会话列表
│   ├── KnockKnockModal.vue      # 通知弹窗
│   ├── AvatarModal.vue          # 头像选择弹窗
│   ├── BusinessCardModal.vue    # 名片选择弹窗
│   ├── ProfileSettingsModal.vue # 资料设置弹窗
│   ├── UserHoverCard.vue        # 用户悬浮卡片
│   └── ConfirmDialog.vue        # 确认对话框
├── composables/             # 组合式函数（逻辑复用）
│   ├── useApi.ts                # API 客户端（核心，封装全部后端接口）
│   ├── useDmStream.ts           # DM 私信 WebSocket 客户端（单例）
│   ├── useDmConversations.ts    # DM 会话管理
│   ├── useKkCall.ts             # AI 通话（SSE 流式）
│   ├── useKnockKnockConversations.ts # 敲敲通知会话
│   ├── useKnockKnockModal.ts    # 通知弹窗逻辑
│   ├── useLoginDialog.ts        # 登录弹窗逻辑
│   ├── useDiscussionModal.ts    # 帖子弹窗逻辑
│   ├── useConfirmDialog.ts      # 确认框逻辑
│   ├── useBodyScrollLock.ts     # 背景滚动锁定
│   └── usePageDataLoading.ts    # 页面数据加载
├── stores/                  # Pinia 状态
│   └── auth.ts                  # 认证状态（token、用户信息）
├── router/                  # 路由配置
├── types/                   # TypeScript 类型定义
│   ├── api.ts                   # 请求 / 分页类型
│   └── entities.ts              # 领域实体类型
├── utils/                   # 工具函数
│   ├── sse.ts                   # SSE 解析（fetch + ReadableStream）
│   ├── format-body.ts           # Markdown 渲染 + XSS 过滤
│   ├── api-error.ts             # 错误处理
│   ├── cover.ts                 # 封面处理
│   ├── pagination.ts            # 分页游标
│   ├── query.ts                 # 查询参数
│   ├── skeleton.ts              # 骨架屏
│   └── time.ts                  # 时间格式化
├── mock/                    # 开发用 Mock 数据（拦截 fetch）
│   ├── data.ts                  # 模拟数据
│   ├── handlers.ts              # 请求处理器
│   └── server.ts                # Mock 服务器入口
└── assets/styles/           # 全局样式
```

## 页面与路由

| 路径 | 组件 | 说明 |
| --- | --- | --- |
| `/` | HomePage | 首页瀑布流帖子 |
| `/create` | CreatePage | 发帖 / 草稿编辑 |
| `/discussion/:id` | DiscussionDetailPage | 帖子详情 |
| `/profile/:id` | ProfilePage | 用户个人主页 |
| `/knock` | KnockPage | 通知 / 敲敲页面 |
| 其它 | — | 重定向至 `/` |

路由采用 `createWebHistory` 模式，切换页面时滚动位置回到顶部。

## 核心功能

- **认证**：邮箱登录、邮箱验证码注册、token 持久化、会话过期自动登出
- **文章**：瀑布流列表、详情、发布、草稿编辑与发布、删除、点赞、阅读数、封面
- **评论**：评论列表、回复、发表、删除、点赞
- **用户中心**：个人资料编辑、名片装备、头像装备、隐私设置
- **文件上传**：图片上传（带进度回调）
- **实时通知**：敲敲（Knock）会话 + SSE 实时推送
- **私信**：DM 会话列表、发送、撤回、已读，WebSocket 长连接
- **AI 通话**：KK-Call 与角色 AI 流式对话（SSE）

## 数据请求与字段映射

所有后端接口统一封装在 `src/composables/useApi.ts` 中，通过 `useApi()` 获取实例。

**统一返回结构约定**：后端返回 `{ code, msg, data }`，`code === '1'`（或 `1`）视为成功，否则抛出 `msg` 作为错误信息。

**字段映射**：后端 3.0 采用 `xxxNo` 命名（`userNo` / `articleNo` / `commentNo` / `coverNo` / `cardNo` / `avatarNo` / `conversationNo` / `messageNo` / `draftNo`），前端统一映射为 `documentId`，并通过 `mapUser` / `mapArticle` / `mapComment` / `mapCard` / `mapAvatar` 等函数做字段归一化，屏蔽前后端命名差异。

**请求头**：鉴权使用自定义 `token` 请求头（非 `Authorization: Bearer`），与后端网关 `JwtAuthGlobalFilter` 保持一致。

## 认证机制

- token 存储于 `localStorage`（key 为 `access_token`）
- 登录成功后调用 `setSession` 持久化，应用启动时通过 `hydrateFromStorage` 恢复并拉取当前用户
- 请求收到 401 / 403 时，`useApi` 自动清除会话、弹出登录框并抛出「登录已过期」错误
- 登出时广播 `auth:logout` 自定义事件，供各组件清理状态

## 实时通信

| 场景 | 协议 | 实现 |
| --- | --- | --- |
| 敲敲通知推送 | SSE | `KnockStreamController`（后端） + `fetchSSE` |
| DM 私信 | WebSocket | `useDmStream` + `/dm/socket` |
| KK-Call AI 通话 | SSE（POST 流式） | `useKkCall` + `fetchSSE` |

**SSE 实现**：`src/utils/sse.ts` 使用 `fetch + ReadableStream` 自行解析 SSE 帧，而非原生 `EventSource`。原因是 `EventSource` 不支持自定义请求头（无法携带 `token`）且仅支持 GET，而本项目的 SSE 接口为 POST 且需鉴权。

**WebSocket 实现**：`useDmStream` 为模块级单例，全 SPA 共用一条连接；通过一次性 ticket 鉴权，内置心跳保活（20s）、指数退避重连（最多 6 次）。

## 环境依赖

- Node.js >= 18
- pnpm >= 8
- [zenless-ui](../zenless-ui) 本地 workspace 组件库（`vite.config.ts` 通过别名引用）
- 后端服务 [interknot-web-back-end-3.0](../interknot-web-back-end-3.0)（默认网关 `http://localhost:8080`）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动开发服务器

```bash
pnpm dev
```

开发服务器默认运行在 `http://localhost:5173`，API 请求自动代理到后端网关 `http://localhost:8080`。

### 3. 构建生产版本

```bash
pnpm build
```

构建产物输出到 `dist/` 目录。

### 4. 预览生产构建

```bash
pnpm preview
```

## 开发代理配置

代理规则定义在 `vite.config.ts` 中：

| 前缀 | 目标 | 说明 |
| --- | --- | --- |
| `/api` | `http://localhost:8080` | 去掉 `/api` 前缀后转发（`ws: true`） |
| `/dm/socket` | `ws://localhost:8080` | WebSocket 代理 |
| `/cover` | `http://localhost:8080` | 封面图片 |
| `/avatar` | `http://localhost:8080` | 头像图片 |

## Mock 数据

开发环境下，`src/mock/server.ts` 通过拦截 `window.fetch` 提供本地 Mock 数据，命中 `handlers.ts` 中定义的路由时直接返回模拟响应，否则走真实请求。无需启动后端即可进行基础页面开发。

## 注意事项

- **zenless-ui 为本地依赖**：`vite.config.ts` 通过 `resolve.alias` 引用 `../zenless-ui`，请确保该目录与前端工程位于同一父目录，否则需调整路径。
- **字段命名差异**：前后端字段命名不一致（`documentId` vs `xxxNo`），统一在 `useApi.ts` 中映射，新增接口时请遵循既有映射约定。
- **鉴权请求头**：后端网关只读取 `token` 请求头，切勿改用 `Authorization: Bearer`。
- **搜索功能**：后端暂无关键词搜索接口，`searchArticles` 已降级为文章列表分页。
- **未实现接口**：消息编辑、置顶（pinned）等后端暂未支持，相关前端方法保留但调用会失败（代码中已注明）。
- 存在 `package-lock.json` 与 `pnpm-lock.yaml` 两份锁文件，建议统一使用 pnpm 并仅保留 `pnpm-lock.yaml`。
## 致谢
- 本项目前端源码主体部分来自[KawaYiLab](https://github.com/KawaYiLab/InterKnot-Web),经过deepseek-v4-pro大模型修改以贴合本项目后端
- 如果觉得有用,请给[后端项目](https://github.com/javvvy/InterKnot-Web)一个star,感谢支持~
