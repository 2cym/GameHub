# GameHub · 可玩小游戏集合网站

一个从零构建的浏览器小游戏合集：**6 款自研游戏即点即玩**，支持账号登录、全球排行榜、收藏与云端成绩同步。

前端 React 18 + Vite + TypeScript，后端 Cloudflare Workers + Hono + D1（SQLite），
**本地开发无需任何云账号**即可跑通完整前后端。

---

## 快速开始

```bash
cd GameHub
npm install

# 初始化本地 D1 数据库（建表）
npm run db:init:local

# 启动开发服务器（前端 + Worker 同时运行）
npm run dev
```
贪吃蛇吃苹果：letian-1ow.pages.dev
个人网站：https://cym-7jm.pages.dev/
打开cym2.de5.net或http://localhost:5173（本地）即可游玩。整个后端（注册/登录/排行榜/收藏）都在本地 Miniflare 里跑，
数据存在 `.wrangler/state` 的本地 SQLite 中。

---

## 包含的游戏

| 游戏 | 类型 | 玩法要点 |
| --- | --- | --- |
| 🐍 贪吃蛇 | 街机 | Canvas 渲染，方向键 / WASD，速度随得分递增 |
| 🔢 2048 | 益智 | 滑动合并相同数字，方向键 / 触屏滑动 |
| 🧱 俄罗斯方块 | 街机 | 7-bag 随机、幽灵投影、硬降/软降、等级加速 |
| 💣 扫雷 | 益智 | 首点必定安全、洪水填充展开、右键/长按插旗、计时计分 |
| 🧠 记忆翻牌 | 益智 | 8 对图案，3D 翻牌动画，步数与用时共同决定得分 |
| 🔨 打地鼠 | 休闲 | 限时 30 秒，普通地鼠 +10、金色地鼠 +30，难度递增 |

所有游戏遵循统一契约：`onGameOver(score)` 上报分数，共用开始/暂停/结束覆盖层，
按需提供移动端触控控件。

---

## 技术架构

```
GameHub/
├── index.html
├── vite.config.ts          # React + @cloudflare/vite-plugin
├── wrangler.jsonc          # Worker 入口 + D1 绑定 + SPA 兜底路由
├── schema.sql              # D1 建表脚本
├── .dev.vars               # 本地密钥（JWT_SECRET），已被 gitignore
├── src/                    # 前端
│   ├── main.tsx / App.tsx  # 入口、路由、错误边界
│   ├── styles/             # tokens.css 设计令牌 + global.css + CSS Modules
│   ├── lib/                # api.ts（fetch 封装）、localBest.ts（本地兜底）、types.ts
│   ├── stores/             # zustand：auth（登录态/收藏）、toast
│   ├── components/         # Navbar / GameCard / Leaderboard / AuthModal / ToastHost / ErrorBoundary
│   ├── pages/              # Home / GamePage / Profile / NotFound
│   └── games/              # registry.ts（游戏注册表）+ shared/ + 六款游戏目录
└── worker/                 # 后端
    ├── index.ts            # Hono 应用与全部路由
    └── auth.ts             # PBKDF2 密码哈希 + HMAC-SHA256 JWT
```

### 前后端一体开发

`@cloudflare/vite-plugin` 让 `npm run dev` 一条命令同时启动：
- Vite 提供前端与 HMR
- Worker 代码在同进程内以 Miniflare 运行，`/api/*` 直接命中 Hono
- D1 走本地 SQLite，无需联网、无需登录 Cloudflare

生产构建产物为 `dist/client`（静态资源）与 Worker 脚本，由 `wrangler deploy` 一起发布。

---

## API

所有接口以 `/api` 为前缀，会话通过 **HttpOnly Cookie** 携带 JWT。

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/email-code` | — | 发送邮箱验证码（`purpose`: `register` / `reset`，60 秒重发冷却） |
| POST | `/api/auth/register` | — | 注册（邮箱 + 用户名 + 密码 + **邮箱验证码**） |
| POST | `/api/auth/login` | — | 登录 |
| POST | `/api/auth/logout` | — | 退出登录 |
| POST | `/api/auth/forgot-password` | — | 忘记密码（邮箱验证码 + 新密码重置） |
| GET | `/api/auth/me` | — | 获取当前登录用户（未登录返回 `user: null`） |
| GET | `/api/leaderboard/:gameId` | — | 各游戏 Top 10 排行榜 |
| POST | `/api/scores` | ✓ | 提交成绩（仅当破个人纪录时写入） |
| GET | `/api/me/scores` | ✓ | 我的各游戏最高分 |
| GET | `/api/me/scores/recent` | ✓ | 我的最近 20 条成绩 |
| GET | `/api/me/favorites` | ✓ | 我的收藏列表 |
| POST | `/api/me/favorites` | ✓ | 添加收藏 |
| DELETE | `/api/me/favorites/:gameId` | ✓ | 取消收藏 |

### 数据库表

```
users(id, email UNIQUE, username UNIQUE, password_hash, salt, created_at)
scores(id, user_id → users.id, game_id, score, created_at)   索引: (game_id, score DESC)
favorites(user_id, game_id, created_at)  PK: (user_id, game_id)
email_verifications(email, purpose, code_hash, salt, attempts, expires_at, created_at)  PK: (email, purpose)
```

### 邮箱验证服务

注册与忘记密码共用一套**邮箱验证码**流程，通过 [Resend](https://resend.com) REST API 发信
（Workers 不支持 SMTP，只能走 HTTP）。API Key 只放在环境变量 `RESEND_API_KEY` 里，不写进代码。

- **配置**：本地写进 `.dev.vars`；线上用 `npx wrangler secret put RESEND_API_KEY`（不要提交仓库）。
  发件人由 `MAIL_FROM` 控制，放在 `wrangler.jsonc` 的 `vars` 里
- **未配置密钥时直接拒绝**：接口返回 400「邮箱验证服务尚未启用」，**不会签发任何验证码**，
  响应里也永远不带验证码——避免生产环境漏配密钥却静默绕过验证
  （`sendMail` 内还有一层 502「邮件服务未配置」兜底）
- **安全策略**：验证码仅存 PBKDF2 哈希；10 分钟有效；错 5 次作废；60 秒重发冷却；校验成功即删除（单次有效）。
  密钥预检在签发验证码之前执行，避免用户拿到一个永远收不到邮件的验证码；
  发送失败则作废刚签发的验证码
- **发件地址说明**：默认 `onboarding@resend.dev` 是 Resend 的测试地址，**只能发给 Resend
  账号本人注册的邮箱**；要发给任意邮箱，需在 Resend 验证自有域名后把 `MAIL_FROM` 改为
  `GameHub <noreply@你的域名>`
- **出站请求约束**：只允许 https，且 host 必须在白名单（`api.resend.com`）内，
  拒绝 localhost / 环回 / 私有地址

### 安全设计

- 密码用 **PBKDF2-SHA256**（10 万次迭代）加盐哈希，绝不明文存储
- 邮箱验证码同样 PBKDF2 加盐哈希存储，配合有效期 / 次数 / 冷却三重限制防爆破与刷信
- 会话为 **HMAC-SHA256 签名的 JWT**，写在 **HttpOnly + SameSite=Lax** Cookie 中，前端 JS 无法读取
- 所有写接口经鉴权中间件校验，并校验 `gameId` 白名单与分数范围，防止越权与刷分
- 服务端只保存个人最好成绩，重复提交低分不会污染排行榜

---

## 数据策略：游客可玩，登录同步

| | 游客 | 已登录 |
| --- | --- | --- |
| 游玩 | ✓ 全部游戏 | ✓ 全部游戏 |
| 成绩保存 | 浏览器 localStorage | 云端 D1 + 本地兜底 |
| 排行榜 | 仅可查看 | 可上榜、可查看 |
| 收藏 | 点击时提示登录 | 云端同步 |

个人最高分统一取 `max(本地纪录, 云端纪录)` 展示，因此登录前后成绩不会"丢失"。

---

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（前端 + Worker + 本地 D1） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建产物 |
| `npm run typecheck` | 分别检查前端与 Worker 的 TypeScript 类型 |
| `npm run db:init:local` | 初始化本地 D1 表结构 |
| `npm run db:init:remote` | 初始化线上 D1 表结构 |
| `npm run deploy` | 构建并发布到 Cloudflare |

---

## 部署到 Cloudflare

本地开发无需账号；要发布到公网才需要以下步骤。

1. **登录 Cloudflare**

   ```bash
   npx wrangler login
   ```

2. **创建线上 D1 数据库**

   ```bash
   npx wrangler d1 create gamehub-db
   ```

   把命令输出里的 `database_id` 填回 `wrangler.jsonc` 中 `d1_databases[0].database_id`
   （当前是本地开发占位值 `local-dev-placeholder`）。

3. **建表**

   ```bash
   npm run db:init:remote
   ```

   **每次改动 `schema.sql` 后都要重跑**（语句是 `CREATE ... IF NOT EXISTS`，可安全重复执行）。
   只改代码不跑这一步的话，新表不会在线上出现，接口会直接 500。

4. **配置生产密钥**

   `JWT_SECRET` 必须换成随机长字符串，且**不要**提交到仓库：

   ```bash
   npx wrangler secret put JWT_SECRET
   ```

   邮件服务同样必须配置 Resend Key（**不能不带 Key 上生产**，否则 `/api/auth/email-code`
   会返回 400「邮箱验证服务尚未启用」，验证码无法发送）：

   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

5. **发布**

   ```bash
   npm run deploy
   ```

> 提示：`.dev.vars` 已被 `.gitignore` 忽略，本地开发用的弱密钥不会进入仓库。

---

## 本地数据重置

验证过程会在本地 D1 留下测试数据。清空后重新开始：

```bash
rm -rf .wrangler/state
npm run db:init:local
```

浏览器端的本地最高分存在 localStorage 的 `gamehub.localBest.v1` 键中，清除站点数据即可重置。

---

## 移动端（手机竖屏）

所有游戏在 320–430px 宽度下实测**无横向溢出**，操作控件均位于屏幕内。
触摸目标按「不小于 44px、间距不小于 8px」的原则设计。

### 各游戏的操作方式

| 游戏 | 手机操作 |
| --- | --- |
| 🐍 贪吃蛇 | **在棋盘上滑动**转向（滑过 20px 判定，不抬手可连续改向）；下方四向按钮备用，58×58 |
| 🔢 2048 | 滑动屏幕移动方块 |
| 🧱 俄罗斯方块 | **贴底操作条**（左移 / 旋转 / 右移 / 软降 / 硬降），始终可见不会被推到屏幕外；棋盘上也可左右滑动、下滑硬降、点按旋转、长按软降 |
| 💣 扫雷 | **「挖开 / 插旗」模式开关** —— 手机上右键不可用，用模式切换替代长按，避免误挖；长按 250ms 插旗并带触觉反馈。棋盘在手机上左右满宽 |
| 🧠 记忆翻牌 | 点按翻开，卡片随宽度自适应 |
| 🔨 打地鼠 | **整个洞口（约 105px）都是点击目标**，地鼠仅作视觉层；触屏下地鼠停留时间放宽 |

### 已知取舍

- **扫雷格子宽度受限**：9 列网格在 390px 屏上单格约 36px，320px 屏上约 28px。
  要在 9 列下做到 44px 需要 444px 宽度，数学上无法满足。
  当前 28px 仍满足 WCAG 2.5.8 的最低要求（24px），
  且「插旗模式开关」已消除最昂贵的误操作（挖错格），因此保留 9 列不变。
- 触控控件在 `max-width: 768px` 或存在粗指针（`any-pointer: coarse`）时显示，
  比 `(hover: none) and (pointer: coarse)` 更能覆盖触控笔平板、接鼠标的手机等混合设备。
- 所有 `:hover` 样式均包在 `@media (hover: hover)` 内，避免触屏点按后样式「粘住」。

---

## 浏览器兼容性

- 现代 Chromium / Firefox / Safari
- 依赖 `crypto.subtle`（浏览器与 Workers 运行时均内置）、CSS Grid、CSS 自定义属性与 `backface-visibility`
- 使用 `env(safe-area-inset-bottom)` 适配 iPhone 底部横条
- 尊重 `prefers-reduced-motion`，对动画敏感的玩家会自动降低动效
