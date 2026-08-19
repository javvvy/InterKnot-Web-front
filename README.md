# 绳网 (InterKnot) - 前端

绳网是一个游戏、技术交流社区平台，灵感来源于《绝区零》中的"绳网"——新艾利都最大的匿名委托中心。你可以在这里发现并分享有趣的内容。

## 技术栈

- **框架**: Vue 3 + TypeScript
- **构建工具**: Vite 6
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **UI 组件库**: zenless-ui（绝区零主题组件库）
- **HTTP 客户端**: ofetch
- **CSS 预处理**: Sass (SCSS)
- **包管理器**: pnpm

## 项目结构

```
src/
├── main.ts                  # 应用入口
├── App.vue                  # 根组件
├── pages/                   # 页面组件
│   ├── HomePage.vue         #   首页（瀑布流帖子）
│   ├── CreatePage.vue       #   发帖页面
│   ├── DiscussionDetailPage.vue  # 帖子详情页
│   ├── ProfilePage.vue      #   用户个人主页
│   └── KnockPage.vue        #   通知页面
├── components/              # 可复用组件
│   ├── AppHeader.vue        #   顶部导航栏
│   ├── MobileBottomNav.vue  #   移动端底部导航
│   ├── DiscussionCard.vue   #   帖子卡片
│   ├── DiscussionOverlay.vue #  帖子详情弹窗
│   ├── CommentItem.vue      #   评论组件
│   ├── LoginDialog.vue      #   登录/注册弹窗
│   ├── KkCallPanel.vue      #   AI 对话面板
│   └── ...
├── composables/             # 组合式函数（逻辑复用）
│   ├── useApi.ts            #   API 客户端
│   ├── useDmStream.ts       #   私信 SSE 流
│   ├── useKkCall.ts         #   AI 通话
│   └── ...
├── stores/                  # Pinia 状态
│   └── auth.ts              #   认证状态（token、用户信息）
├── router/                  # 路由配置
├── types/                   # TypeScript 类型定义
├── utils/                   # 工具函数
├── mock/                    # 开发用 Mock 数据
└── assets/styles/           # 全局样式
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

开发服务器默认运行在 `http://localhost:5173`。API 请求会自动代理到 `http://localhost:8080` 的后端服务。

### 构建生产版本

```bash
pnpm build
```

构建产物输出到 `dist/` 目录。

### 预览生产构建

```bash
pnpm preview
```

## 开发说明

- 开发环境下可使用 `src/mock/` 目录中的 Mock 数据，无需启动后端服务。
- 全局 SCSS 变量由 `zenless-ui` 组件库提供，无需手动导入。
- 路径别名 `@` 映射到 `src/` 目录。
- 自定义光标资源存放在 `public/cursors/` 目录。
- 预设头像和名片存放在 `public/avatars/` 和 `public/preset-cards/`。

## 后端依赖

本前端需要配合 [interknot-web-back-end-2.0](../interknot-web-back-end-2.0) 后端服务使用，API 代理配置见 `vite.config.ts`。
