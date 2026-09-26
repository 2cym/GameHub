import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { MiddlewareHandler } from 'hono'
import {
  COOKIE_NAME,
  hashPassword,
  newUserId,
  randomSalt,
  signToken,
  verifyToken,
} from './auth'
import { HTTPError, badRequest } from './errors'
import { emailServiceReady, sendMail, verificationEmailHtml } from './email'
import { issueCode, verifyCode, deleteCode } from './verification'

export interface Env {
  DB: D1Database
  JWT_SECRET: string
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  ADMIN_EMAIL?: string
  /** AI 服务地址（OpenAI 兼容 /v1），例如 https://token.sensenova.cn/v1 */
  AI_BASE_URL?: string
  /** AI 服务密钥，走 `npx wrangler secret put AI_API_KEY`，不写入本文件 */
  AI_API_KEY?: string
  /** Turnstile site key（公开，客户端用）；SECRET 走 wrangler secret put */
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET?: string
  /** Cloudflare Workers AI 内建绑定（wrangler.jsonc 的 ai binding）；后台切到 cloudflare 时才用 */
  AI?: unknown
}

interface AuthUser {
  id: string
  email: string
  username: string
  is_admin: boolean
  is_banned: boolean
}

interface Vars {
  user: AuthUser
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_RE = /^\d{6}$/
const USERNAME_RE = /^[\w\u4e00-\u9fa5-]{2,20}$/
const GAME_IDS = new Set([
  'snake',
  'g2048',
  'tetris',
  'minesweeper',
  'memory',
  'whackamole',
  'sudoku',
  'sokoban',
  'klotski',
  'gomoku',
  'xiangqi',
  'chess',
  'go',
  'contra',
])

// ---------- 棋类 AI（双提供方：OpenAI 兼容接口 / Cloudflare Workers AI） ----------

/** 走法候选上限，防止超大请求 */
const AI_MAX_LEGAL_MOVES = 400
/** 候选数量：中等取 3，困难取 6 */
const AI_CANDIDATES: Record<'medium' | 'hard', number> = { medium: 3, hard: 6 }
/** temperature：困难更低以保证确定性；模型自身的强制值优先 */
const AI_TEMPERATURE: Record<'medium' | 'hard', number> = { medium: 0.7, hard: 0.4 }
const AI_GAMES = new Set(['chess', 'gomoku', 'go', 'xiangqi'])
/** 关闭推理时的 max_tokens：只需吐一个短 JSON 数组 */
const AI_MAX_TOKENS = 256
/** 开启推理时的 max_tokens：推理本身会吃掉大量 token，预算不足会把正文截断成空 */
const AI_MAX_TOKENS_REASONING = 4000
/** 请求超时：关闭推理只需 1–4 秒，开启推理可能先想几十秒 */
const AI_TIMEOUT_MS = 30000
const AI_REASONING_TIMEOUT_MS = 90000

/** 可切换的模型及其元数据。temp 为该模型的强制 temperature（该模型拒绝非 1 的值）。 */
interface AiModelInfo {
  id: string
  label: string
  desc: string
  temp?: number
}

/** OpenAI 兼容接口可选模型；延迟为 2026-09 实测值，仅供后台展示参考 */
const AI_API_MODELS: AiModelInfo[] = [
  { id: 'sensenova-6.8-flash-lite', label: 'SenseNova 6.8 Flash Lite', desc: '轻量高效多模态智能体，关推理实测约 1–2.5 秒' },
  { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', desc: '新一代高效通用，关推理实测约 0.9 秒' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', desc: '高效经济型通用，关推理实测约 1.3 秒' },
  { id: 'glm-5.2', label: 'GLM-5.2', desc: '智谱旗舰开源，1M 上下文，关推理实测约 1.2 秒' },
  { id: 'kimi-k3', label: 'Kimi K3', desc: '月之暗面旗舰，仅接受 temperature=1，实测约 4 秒', temp: 1 },
]

/** Workers AI 可选模型；需先在 Cloudflare 控制台开通 Workers AI */
const AI_CF_MODELS: AiModelInfo[] = [
  { id: '@cf/meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct', desc: 'Workers AI 旗舰' },
  { id: '@cf/meta/llama-3-70b-instruct', label: 'Llama 3 70B Instruct', desc: 'Workers AI 经典大模型' },
  { id: '@cf/meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B Instruct', desc: 'Workers AI 轻量' },
]
/** 游客额度归属前缀：同一设备 ID 一天共享一个额度 */
const AI_GUEST_PREFIX = 'guest:'
/** 设备 ID 格式：客户端 16 字节随机数转十六进制 */
const DEVICE_ID_RE = /^[a-f0-9]{32}$/
/** 设备 ID 上限，防超大请求体 */
const DEVICE_ID_MAX = 64
/** Turnstile token 上限 */
const TURNSTILE_TOKEN_MAX = 2048
/** Turnstile 校验服务地址 */
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
/** 校验超时，避免拖慢 AI 请求 */
const TURNSTILE_TIMEOUT_MS = 5000

// ---------- AI 运行时设置（site_settings 表，管理后台可调） ----------

const AI_PROVIDERS = ['api', 'cloudflare', 'off'] as const
type AiProvider = (typeof AI_PROVIDERS)[number]

const SETTING_KEYS = {
  provider: 'ai_provider',
  apiModel: 'ai_model',
  cfModel: 'ai_cf_model',
  reasoning: 'ai_reasoning',
} as const

interface AiSettings {
  provider: AiProvider
  apiModel: string
  cfModel: string
  reasoning: boolean
}

/** 默认设置。AI 凭据缺失时 /api/ai/move 会自动回落本地 AI，不会影响对局 */
const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'api',
  apiModel: 'sensenova-6.8-flash-lite',
  cfModel: '@cf/meta/llama-3.3-70b-instruct',
  reasoning: false,
}

function pickProvider(v: unknown): AiProvider {
  return v === 'api' || v === 'cloudflare' || v === 'off' ? v : DEFAULT_AI_SETTINGS.provider
}

function pickModel(list: AiModelInfo[], v: unknown, fallback: string): string {
  return typeof v === 'string' && list.some((m) => m.id === v) ? v : fallback
}

/** 该模型的强制 temperature；未声明时用难度默认值 */
function modelTemperature(id: string, list: AiModelInfo[], fallback: number): number {
  return list.find((m) => m.id === id)?.temp ?? fallback
}

/**
 * 读取设置。任何缺值或非法值都回落到代码默认，保证配置被写坏时 /api/ai/move 依然可用。
 * 表很小（只有 4 行），整表读取避免 IN(...) 绑定的兼容性问题。
 */
async function loadAiSettings(db: D1Database): Promise<AiSettings> {
  let map: Map<string, string>
  try {
    // site_settings 是后加的表：旧库尚未跑过 migrate.sql 时会 SQLITE_ERROR。
    // 读不到就当「未配置」处理，回落默认值 —— 不能让它把 /api/ai/move 一起搞成 500。
    const { results } = await db
      .prepare('SELECT key, value FROM site_settings')
      .all<{ key: string; value: string }>()
    map = new Map(results.map((r) => [r.key, r.value]))
  } catch {
    return DEFAULT_AI_SETTINGS
  }
  return {
    provider: pickProvider(map.get(SETTING_KEYS.provider)),
    apiModel: pickModel(AI_API_MODELS, map.get(SETTING_KEYS.apiModel), DEFAULT_AI_SETTINGS.apiModel),
    cfModel: pickModel(AI_CF_MODELS, map.get(SETTING_KEYS.cfModel), DEFAULT_AI_SETTINGS.cfModel),
    reasoning: map.get(SETTING_KEYS.reasoning) === 'on',
  }
}

/** 探测两个提供方当前是否真的可用，供后台展示灰显状态 */
function aiCapabilities(env: Env): {
  api: { configured: boolean; baseUrl: string }
  cloudflare: { available: boolean }
} {
  return {
    api: {
      configured: Boolean((env.AI_BASE_URL ?? '').trim() && (env.AI_API_KEY ?? '').trim()),
      baseUrl: env.AI_BASE_URL ?? '',
    },
    cloudflare: { available: typeof (env.AI as { run?: unknown })?.run === 'function' },
  }
}

type AiGameName = '国际象棋' | '五子棋' | '围棋' | '中国象棋'
const AI_GAME_LABEL: Record<string, AiGameName> = {
  chess: '国际象棋',
  gomoku: '五子棋',
  go: '围棋',
  xiangqi: '中国象棋',
}

/** 校验游客提交的 Turnstile token；secret 是否配置由调用方判断 */
async function verifyTurnstile(secret: string, token: string, remoteIp: string): Promise<boolean> {
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        `secret=${encodeURIComponent(secret)}` +
        `&response=${encodeURIComponent(token)}` +
        `&remoteip=${encodeURIComponent(remoteIp)}`,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    })
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null
    return !!data?.success
  } catch {
    return false
  }
}

async function loadUser(db: D1Database, id: string): Promise<AuthUser | null> {
  const row = await db
    .prepare('SELECT id, email, username, is_admin, is_banned FROM users WHERE id = ?')
    .bind(id)
    .first<AuthUser>()
  return row ?? null
}

/** 鉴权中间件：验证 Cookie 中的 JWT，把 user 挂到上下文 */
const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const token = getCookie(c, COOKIE_NAME)
  const payload = token ? await verifyToken(token, c.env.JWT_SECRET) : null
  if (!payload) throw new HTTPError(401, '请先登录')
  const user = await loadUser(c.env.DB, payload.uid)
  if (!user) throw new HTTPError(401, '登录态已失效，请重新登录')
  if (user.is_banned) throw new HTTPError(403, '账号已被封禁')
  c.set('user', user)
  await next()
}

/** 管理员中间件：在 requireAuth 之后检查 is_admin */
const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const user = c.get('user')
  if (!user.is_admin) throw new HTTPError(403, '需要管理员权限')
  await next()
}

export const app = new Hono<{ Bindings: Env; Variables: Vars }>()

// 统一错误处理（含中间件抛出的 HTTPError）
app.onError((err, c) => {
  if (err instanceof HTTPError) {
    return c.json({ error: err.message }, err.status as 400)
  }
  console.error('unexpected:', err)
  return c.json({ error: '服务器开小差了，请稍后再试' }, 500)
})

// ---------- 认证 ----------

// 发送邮箱验证码（注册 / 重置密码共用）
app.post('/api/auth/email-code', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { email, purpose } = (body ?? {}) as Record<string, unknown>
  if (typeof email !== 'string' || !EMAIL_RE.test(email))
    badRequest('邮箱格式不正确')
  if (purpose !== 'register' && purpose !== 'reset')
    badRequest('未知的验证用途')

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?')
    .bind(email)
    .first()
  if (purpose === 'register' && exists) badRequest('该邮箱已被注册，请直接登录')
  if (purpose === 'reset' && !exists) badRequest('该邮箱尚未注册')

  // 配置预检必须在签发验证码之前，否则用户会拿到一个永远收不到邮件的验证码
  if (!emailServiceReady(c.env))
    badRequest('邮箱验证服务尚未启用，请稍后再试')

  const code = await issueCode(c.env.DB, email, purpose)
  try {
    await sendMail(c.env, email, 'GameHub 验证码', verificationEmailHtml(code, 10))
  } catch (err) {
    // 发送失败时作废刚签发的验证码，避免用户等一封永远收不到的邮件
    await deleteCode(c.env.DB, email, purpose)
    throw err
  }

  return c.json({ ok: true })
})

app.post('/api/auth/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { email, username, password, code } = (body ?? {}) as Record<string, unknown>
  if (typeof email !== 'string' || !EMAIL_RE.test(email))
    badRequest('邮箱格式不正确')
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    badRequest('用户名需为 2-20 位字母、数字、中文或短横线')
  if (typeof password !== 'string' || password.length < 6)
    badRequest('密码至少 6 位')
  if (typeof code !== 'string' || !CODE_RE.test(code))
    badRequest('请输入 6 位数字邮箱验证码')

  const exists = await c.env.DB.prepare(
    'SELECT 1 FROM users WHERE email = ? OR username = ?',
  )
    .bind(email, username)
    .first()
  if (exists) badRequest('该邮箱或用户名已被注册')

  await verifyCode(c.env.DB, email, 'register', code)

  const id = newUserId()
  const salt = randomSalt()
  const passwordHash = await hashPassword(password, salt)
  const isAdmin = Boolean(c.env.ADMIN_EMAIL) && email.toLowerCase() === c.env.ADMIN_EMAIL!.toLowerCase()
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, username, password_hash, salt, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, email, username, passwordHash, salt, isAdmin ? 1 : 0)
    .run()

  const token = await signToken({ uid: id, admin: isAdmin }, c.env.JWT_SECRET)
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return c.json({ user: { id, email, username, isAdmin } })
})

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { email, password } = (body ?? {}) as Record<string, unknown>
  if (typeof email !== 'string' || typeof password !== 'string')
    badRequest('请填写邮箱与密码')

  const row = await c.env.DB.prepare(
    'SELECT id, email, username, password_hash, salt, is_admin FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{
      id: string
      email: string
      username: string
      password_hash: string
      salt: string
      is_admin: boolean
    }>()

  if (!row) throw new HTTPError(401, '邮箱或密码错误')
  const hash = await hashPassword(password, row.salt)
  if (hash !== row.password_hash) {
    throw new HTTPError(401, '邮箱或密码错误')
  }

  const token = await signToken({ uid: row.id, admin: row.is_admin }, c.env.JWT_SECRET)
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return c.json({ user: { id: row.id, email: row.email, username: row.username, isAdmin: row.is_admin } })
})

// 忘记密码：邮箱验证码 + 新密码直接重置（验证码校验通过即消费，不自动登录）
app.post('/api/auth/forgot-password', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { email, code, newPassword } = (body ?? {}) as Record<string, unknown>
  if (typeof email !== 'string' || !EMAIL_RE.test(email))
    badRequest('邮箱格式不正确')
  if (typeof code !== 'string' || !CODE_RE.test(code))
    badRequest('请输入 6 位数字邮箱验证码')
  if (typeof newPassword !== 'string' || newPassword.length < 6)
    badRequest('新密码至少 6 位')

  await verifyCode(c.env.DB, email, 'reset', code)

  const salt = randomSalt()
  const passwordHash = await hashPassword(newPassword, salt)
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, salt = ? WHERE email = ?',
  )
    .bind(passwordHash, salt, email)
    .run()
  return c.json({ ok: true })
})

app.post('/api/auth/logout', (c) => {
  setCookie(c, COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const token = getCookie(c, COOKIE_NAME)
  const payload = token ? await verifyToken(token, c.env.JWT_SECRET) : null
  if (!payload) return c.json({ user: null })
  const user = await loadUser(c.env.DB, payload.uid)
  return c.json({ user: user ? { ...user, isAdmin: user.is_admin } : null })
})

// ---------- 排行榜（公开） ----------

app.get('/api/leaderboard/:gameId', async (c) => {
  const gameId = c.req.param('gameId')
  if (!GAME_IDS.has(gameId)) badRequest('未知的游戏')
  const { results } = await c.env.DB.prepare(
    `SELECT u.username AS username, MAX(s.score) AS score
     FROM scores s JOIN users u ON u.id = s.user_id
     WHERE s.game_id = ?
     GROUP BY s.user_id
     ORDER BY score DESC
     LIMIT 10`,
  )
    .bind(gameId)
    .all<{ username: string; score: number }>()
  return c.json({ entries: results ?? [] })
})

// ---------- 流量统计（公开） ----------

app.post('/api/analytics/view', async (c) => {
  const body = await c.req.json().catch(() => null)
  const path = body && typeof (body as Record<string, unknown>).path === 'string'
    ? String((body as Record<string, unknown>).path).slice(0, 200)
    : '/'
  if (!path.startsWith('/')) badRequest('无效路径')
  await c.env.DB.prepare('INSERT INTO page_views (path) VALUES (?)').bind(path).run()
  return c.json({ ok: true })
})

// ---------- 以下接口需登录 ----------

app.post('/api/scores', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { gameId, score } = (body ?? {}) as Record<string, unknown>
  if (typeof gameId !== 'string' || !GAME_IDS.has(gameId))
    badRequest('未知的游戏')
  if (
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 10_000_000
  )
    badRequest('分数不合法')

  const user = c.get('user')
  const prev = await c.env.DB.prepare(
    'SELECT MAX(score) AS best FROM scores WHERE user_id = ? AND game_id = ?',
  )
    .bind(user.id, gameId)
    .first<{ best: number | null }>()

  // 只有破纪录才插入，避免刷分膨胀
  const prevBest = prev?.best ?? 0
  if (score > prevBest) {
    await c.env.DB.prepare(
      'INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?)',
    )
      .bind(user.id, gameId, score)
      .run()
  }
  return c.json({ best: Math.max(prevBest, score) })
})

app.get('/api/me/scores', requireAuth, async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT game_id AS gameId, MAX(score) AS best FROM scores WHERE user_id = ? GROUP BY game_id',
  )
    .bind(user.id)
    .all<{ gameId: string; best: number }>()
  return c.json({ bests: results ?? [] })
})

app.get('/api/me/scores/recent', requireAuth, async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT game_id AS gameId, score, created_at AS createdAt FROM scores WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20',
  )
    .bind(user.id)
    .all<{ gameId: string; score: number; createdAt: number }>()
  return c.json({ records: results ?? [] })
})

// ---------- 收藏 ----------

app.get('/api/me/favorites', requireAuth, async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT game_id AS gameId FROM favorites WHERE user_id = ?',
  )
    .bind(user.id)
    .all<{ gameId: string }>()
  return c.json({ gameIds: (results ?? []).map((r) => r.gameId) })
})

app.post('/api/me/favorites', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const { gameId } = (body ?? {}) as Record<string, unknown>
  if (typeof gameId !== 'string' || !GAME_IDS.has(gameId))
    badRequest('未知的游戏')
  const user = c.get('user')
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO favorites (user_id, game_id) VALUES (?, ?)',
  )
    .bind(user.id, gameId)
    .run()
  return c.json({ ok: true })
})

app.delete('/api/me/favorites/:gameId', requireAuth, async (c) => {
  const gameId = c.req.param('gameId')
  if (!GAME_IDS.has(gameId)) badRequest('未知的游戏')
  const user = c.get('user')
  await c.env.DB.prepare(
    'DELETE FROM favorites WHERE user_id = ? AND game_id = ?',
  )
    .bind(user.id, gameId)
    .run()
  return c.json({ ok: true })
})

// ---------- 管理员接口 ----------

app.get('/api/admin/stats', requireAuth, requireAdmin, async (c) => {
  const db = c.env.DB
  const [userCount, scoreCount, favCount, recentUsers] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS cnt FROM users').first<{ cnt: number }>(),
    db.prepare('SELECT COUNT(*) AS cnt FROM scores').first<{ cnt: number }>(),
    db.prepare('SELECT COUNT(*) AS cnt FROM favorites').first<{ cnt: number }>(),
    db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE created_at >= ?')
      .bind(Math.floor(Date.now() / 1000) - 7 * 24 * 3600)
      .first<{ cnt: number }>(),
  ])
  const { results: gameDist } = await db.prepare(
    'SELECT game_id AS gameId, COUNT(*) AS cnt FROM scores GROUP BY game_id ORDER BY cnt DESC',
  ).all<{ gameId: string; cnt: number }>()
  const { results: recentReg } = await db.prepare(
    `SELECT u.username, u.email, u.created_at AS createdAt, u.is_admin AS isAdmin
     FROM users u ORDER BY u.created_at DESC LIMIT 5`,
  ).all<{ username: string; email: string; createdAt: number; isAdmin: boolean }>()
  return c.json({
    totalUsers: userCount?.cnt ?? 0,
    totalScores: scoreCount?.cnt ?? 0,
    totalFavorites: favCount?.cnt ?? 0,
    newUsers7d: recentUsers?.cnt ?? 0,
    gameDistribution: gameDist ?? [],
    recentRegistrations: recentReg ?? [],
  })
})

app.get('/api/admin/users', requireAuth, requireAdmin, async (c) => {
  const search = c.req.query('search') ?? ''
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100)
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
  const db = c.env.DB
  let where = '1=1'
  const params: unknown[] = []
  if (search) {
    where = '(username LIKE ? OR email LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
  }
  const countRow = await db.prepare(`SELECT COUNT(*) AS cnt FROM users WHERE ${where}`)
    .bind(...params).first<{ cnt: number }>()
  const { results } = await db.prepare(
    `SELECT id, email, username, is_admin AS isAdmin, is_banned AS isBanned, created_at AS createdAt,
            (SELECT COUNT(*) FROM scores WHERE user_id = users.id) AS scoreCount,
            (SELECT COUNT(*) FROM favorites WHERE user_id = users.id) AS favCount
     FROM users WHERE ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all<{
    id: string; email: string; username: string; isAdmin: boolean; isBanned: boolean
    createdAt: number; scoreCount: number; favCount: number
  }>()
  return c.json({ users: results ?? [], total: countRow?.cnt ?? 0 })
})

app.get('/api/admin/users/:id', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const row = await db.prepare(
    `SELECT id, email, username, is_admin AS isAdmin, is_banned AS isBanned, created_at AS createdAt
     FROM users WHERE id = ?`,
  ).bind(id).first<{
    id: string; email: string; username: string; isAdmin: boolean; isBanned: boolean; createdAt: number
  }>()
  if (!row) badRequest('用户不存在')
  const { results: bests } = await db.prepare(
    'SELECT game_id AS gameId, MAX(score) AS best FROM scores WHERE user_id = ? GROUP BY game_id ORDER BY best DESC',
  ).bind(id).all<{ gameId: string; best: number }>()
  const { results: favs } = await db.prepare(
    'SELECT game_id AS gameId FROM favorites WHERE user_id = ?',
  ).bind(id).all<{ gameId: string }>()
  return c.json({ ...row, bests: bests ?? [], favorites: (favs ?? []).map(f => f.gameId) })
})

app.post('/api/admin/users/:id/ban', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id')
  const admin = c.get('user')
  if (id === admin.id) badRequest('不能封禁自己')
  const row = await c.env.DB.prepare('SELECT is_banned AS isBanned FROM users WHERE id = ?')
    .bind(id).first<{ isBanned: boolean }>()
  if (!row) badRequest('用户不存在')
  const newBanned = row.isBanned ? 0 : 1
  await c.env.DB.prepare('UPDATE users SET is_banned = ? WHERE id = ?')
    .bind(newBanned, id).run()
  return c.json({ isBanned: Boolean(newBanned) })
})

app.post('/api/admin/users/:id/admin', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id')
  const admin = c.get('user')
  if (id === admin.id) badRequest('不能更改自己的管理员权限')
  const row = await c.env.DB.prepare('SELECT is_admin AS isAdmin FROM users WHERE id = ?')
    .bind(id).first<{ isAdmin: boolean }>()
  if (!row) badRequest('用户不存在')
  const newAdmin = row.isAdmin ? 0 : 1
  await c.env.DB.prepare('UPDATE users SET is_admin = ? WHERE id = ?')
    .bind(newAdmin, id).run()
  return c.json({ isAdmin: Boolean(newAdmin) })
})

app.post('/api/admin/users/:id/password', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { newPassword } = body as Record<string, unknown>
  if (typeof newPassword !== 'string' || newPassword.length < 6)
    badRequest('新密码至少 6 位')
  const row = await c.env.DB.prepare('SELECT 1 FROM users WHERE id = ?')
    .bind(id).first()
  if (!row) badRequest('用户不存在')
  const salt = randomSalt()
  const passwordHash = await hashPassword(newPassword, salt)
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
    .bind(passwordHash, salt, id).run()
  return c.json({ ok: true })
})

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id')
  const admin = c.get('user')
  if (id === admin.id) badRequest('不能删除自己')
  const row = await c.env.DB.prepare('SELECT 1 FROM users WHERE id = ?')
    .bind(id).first()
  if (!row) badRequest('用户不存在')
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?')
    .bind(id).run()
  return c.json({ ok: true })
})

app.get('/api/admin/debug', requireAuth, requireAdmin, async (c) => {
  let dbOk = false
  try {
    await c.env.DB.prepare('SELECT 1').first()
    dbOk = true
  } catch { /* db unavailable */ }
  const settings = await loadAiSettings(c.env.DB)
  const caps = aiCapabilities(c.env)
  return c.json({
    db: dbOk ? 'connected' : 'disconnected',
    jwtSecret: Boolean(c.env.JWT_SECRET) ? 'configured' : 'MISSING',
    resendKey: Boolean(c.env.RESEND_API_KEY) ? 'configured' : 'NOT_SET',
    adminEmail: c.env.ADMIN_EMAIL ?? 'NOT_SET',
    mailFrom: c.env.MAIL_FROM ?? 'default',
    aiProvider: caps.api.configured ? 'configured' : 'NOT_CONFIGURED',
    turnstile:
      c.env.TURNSTILE_SECRET && c.env.TURNSTILE_SITE_KEY ? 'configured' : 'NOT_CONFIGURED',
    aiProviderSetting: settings.provider,
    aiModel: settings.provider === 'cloudflare' ? settings.cfModel : settings.apiModel,
    aiReasoning: settings.reasoning ? 'on' : 'off',
    aiWorkersAiAvailable: caps.cloudflare.available,
    workerVersion: process.env.WORKER_VERSION ?? 'unknown',
  })
})

app.get('/api/admin/analytics', requireAuth, requireAdmin, async (c) => {
  const db = c.env.DB
  const now = Math.floor(Date.now() / 1000)
  const dayAgo = now - 86400
  const weekAgo = now - 7 * 86400

  const [totalViews, viewsToday, viewsWeek] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS cnt FROM page_views').first<{ cnt: number }>(),
    db.prepare('SELECT COUNT(*) AS cnt FROM page_views WHERE created_at >= ?').bind(dayAgo).first<{ cnt: number }>(),
    db.prepare('SELECT COUNT(*) AS cnt FROM page_views WHERE created_at >= ?').bind(weekAgo).first<{ cnt: number }>(),
  ])

  const { results: pathDist } = await db.prepare(
    'SELECT path, COUNT(*) AS cnt FROM page_views WHERE created_at >= ? GROUP BY path ORDER BY cnt DESC LIMIT 20',
  ).bind(dayAgo).all<{ path: string; cnt: number }>()

  const { results: hourly } = await db.prepare(`
    SELECT time(created_at, 'unixepoch', '+' || (CAST(strftime('%s', created_at) AS INTEGER) / 3600 * 3600) || ' hours') AS hour,
           COUNT(*) AS cnt
    FROM page_views WHERE created_at >= ?
    GROUP BY CAST(strftime('%s', created_at) AS INTEGER) / 3600
    ORDER BY hour DESC
    LIMIT 24`,
  ).bind(weekAgo).all<{ hour: string; cnt: number }>()

  return c.json({
    totalViews: totalViews?.cnt ?? 0,
    viewsToday: viewsToday?.cnt ?? 0,
    viewsWeek: viewsWeek?.cnt ?? 0,
    pathDistribution: pathDist ?? [],
    hourlyTraffic: hourly ?? [],
  })
})

// ---------- 留言板（公开写入，管理员删除） ----------

app.post('/api/messages', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { username, content } = (body ?? {}) as Record<string, unknown>
  if (typeof username !== 'string' || username.length < 1 || username.length > 20)
    badRequest('昵称需 1-20 字符')
  if (typeof content !== 'string' || content.length < 1 || content.length > 500)
    badRequest('留言需 1-500 字')
  await c.env.DB.prepare(
    'INSERT INTO messages (user_id, username, content) VALUES (?, ?, ?)',
  ).bind('anonymous', username, content).run()
  return c.json({ ok: true })
})

// 公开留言列表（任何人可看，首页用）
app.get('/api/messages/public', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 20, 50)
  const { results } = await c.env.DB.prepare(
    'SELECT id, username, content, created_at AS createdAt FROM messages ORDER BY created_at DESC LIMIT ?',
  ).bind(limit).all<{ id: number; username: string; content: string; createdAt: number }>()
  return c.json({ messages: results ?? [] })
})

app.get('/api/messages', requireAuth, requireAdmin, async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200)
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
  const { results, meta } = await c.env.DB.prepare(
    'SELECT id, username, content, created_at AS createdAt FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).bind(limit, offset).all<{ id: number; username: string; content: string; createdAt: number }>()
  return c.json({ messages: results ?? [], total: meta?.changes ?? 0 })
})

app.delete('/api/messages/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) badRequest('无效消息 ID')
  await c.env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ---------- 好友系统 ----------

app.get('/api/friends', requireAuth, async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.is_admin AS isAdmin, u.is_banned AS isBanned
     FROM friendships f JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ? ORDER BY u.username`,
  ).bind(user.id).all<{ id: string; username: string; email: string; isAdmin: boolean; isBanned: boolean }>()
  return c.json({ friends: results ?? [] })
})

app.get('/api/friends/search', requireAuth, async (c) => {
  const user = c.get('user')
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 1) return c.json({ users: [] })
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.is_banned AS isBanned
     FROM users u
     WHERE u.id != ? AND (u.username LIKE ? OR u.email LIKE ?)
     AND u.id NOT IN (SELECT friend_id FROM friendships WHERE user_id = ?)
     ORDER BY u.username LIMIT 20`,
  ).bind(user.id, `%${q}%`, `%${q}%`, user.id).all<{ id: string; username: string; isBanned: boolean }>()
  return c.json({ users: results ?? [] })
})

app.post('/api/friends/:userId', requireAuth, async (c) => {
  const user = c.get('user')
  const targetId = c.req.param('userId')
  if (targetId === user.id) badRequest('不能添加自己为好友')
  const target = await c.env.DB.prepare('SELECT id, username FROM users WHERE id = ?').bind(targetId).first()
  if (!target) badRequest('用户不存在')
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)',
  ).bind(user.id, targetId).run()
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)',
  ).bind(targetId, user.id).run()
  return c.json({ ok: true })
})

app.delete('/api/friends/:userId', requireAuth, async (c) => {
  const user = c.get('user')
  const targetId = c.req.param('userId')
  await c.env.DB.prepare(
    'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
  ).bind(user.id, targetId, targetId, user.id).run()
  return c.json({ ok: true })
})

// ---------- 好友对局 ----------

const ROOM_GAME_IDS = new Set(['xiangqi', 'chess', 'gomoku', 'go'])

app.post('/api/rooms', requireAuth, async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { gameId, preferredColor } = (body ?? {}) as Record<string, unknown>
  if (typeof gameId !== 'string' || !ROOM_GAME_IDS.has(gameId)) badRequest('不支持的对局游戏')
  const roomId = 'rm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const color = (typeof preferredColor === 'string' && (preferredColor === 'r' || preferredColor === 'b'))
    ? preferredColor : 'r'
  await c.env.DB.prepare(
    `INSERT INTO game_rooms (id, game_id, host_id, host_color, player_color, board_state, current_turn, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`,
  ).bind(roomId, gameId, user.id, color, color === 'r' ? 'b' : 'r', '[]', color).run()
  return c.json({ roomId })
})

app.get('/api/rooms', requireAuth, async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.game_id, r.host_id, r.player_id, r.host_color, r.player_color,
            r.status, r.created_at AS createdAt,
            u.username AS hostName
     FROM game_rooms r LEFT JOIN users u ON u.id = r.host_id
     WHERE r.host_id = ? OR r.player_id = ?
     ORDER BY r.created_at DESC LIMIT 20`,
  ).bind(user.id, user.id).all<{
    id: string; game_id: string; host_id: string; player_id: string | null
    host_color: string; player_color: string; status: string; createdAt: number; hostName: string | null
  }>()
  return c.json({ rooms: results ?? [] })
})

app.get('/api/rooms/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const roomId = c.req.param('id')
  const row = await c.env.DB.prepare(
    `SELECT r.id, r.game_id, r.host_id, r.player_id, r.host_color, r.player_color,
            r.board_state, r.current_turn, r.last_move, r.status, r.moves_count,
            r.created_at AS createdAt, r.updated_at AS updatedAt,
            u1.username AS hostName, u2.username AS playerName
     FROM game_rooms r
     LEFT JOIN users u1 ON u1.id = r.host_id
     LEFT JOIN users u2 ON u2.id = r.player_id
     WHERE r.id = ?`,
  ).bind(roomId).first<{
    id: string; game_id: string; host_id: string; player_id: string | null
    host_color: string; player_color: string; board_state: string; current_turn: string
    last_move: string | null; status: string; moves_count: number
    createdAt: number; updatedAt: number; hostName: string | null; playerName: string | null
  }>()
  if (!row) badRequest('对局不存在')
  if (row.host_id !== user.id && row.player_id !== user.id)
    throw new HTTPError(403, '无权查看此对局')
  return c.json(row)
})

app.post('/api/rooms/:id/join', requireAuth, async (c) => {
  const user = c.get('user')
  const roomId = c.req.param('id')
  const room = await c.env.DB.prepare(
    'SELECT id, host_id, player_id, host_color, player_color, status FROM game_rooms WHERE id = ?',
  ).bind(roomId).first()
  if (!room) badRequest('对局不存在')
  if (room.status !== 'waiting') badRequest('对局已开始')
  if (room.host_id === user.id) badRequest('你是房主，无需加入')
  await c.env.DB.prepare(
    'UPDATE game_rooms SET player_id = ?, status = ?, updated_at = ? WHERE id = ?',
  ).bind(user.id, 'playing', Math.floor(Date.now() / 1000), roomId).run()
  return c.json({ ok: true })
})

app.post('/api/rooms/:id/move', requireAuth, async (c) => {
  const user = c.get('user')
  const roomId = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { move } = body as Record<string, unknown>
  if (typeof move !== 'object' || move === null) badRequest('无效走法')

  const room = await c.env.DB.prepare(
    'SELECT id, host_id, player_id, host_color, player_color, current_turn, status, moves_count, board_state FROM game_rooms WHERE id = ?',
  ).bind(roomId).first()
  if (!room) badRequest('对局不存在')
  if (room.status === 'finished') badRequest('对局已结束')
  if (room.status === 'waiting') badRequest('对局尚未开始，等待对手加入')

  const userColor = room.host_id === user.id ? room.host_color : room.player_color
  if (room.current_turn !== userColor) throw new HTTPError(400, '还没轮到你')

  const newMoves = (Number(room.moves_count) || 0) + 1
  const now = Math.floor(Date.now() / 1000)
  const nextTurn = userColor === 'r' ? 'b' : 'r'

  await c.env.DB.prepare(
    `UPDATE game_rooms SET current_turn = ?, moves_count = ?, last_move = ?, updated_at = ? WHERE id = ?`,
  ).bind(nextTurn, newMoves, JSON.stringify(move), now, roomId).run()

  return c.json({ ok: true, currentTurn: nextTurn, movesCount: newMoves })
})

app.post('/api/rooms/:id/resign', requireAuth, async (c) => {
  const user = c.get('user')
  const roomId = c.req.param('id')
  const room = await c.env.DB.prepare(
    'SELECT id, host_id, player_id, status, game_id FROM game_rooms WHERE id = ?',
  ).bind(roomId).first()
  if (!room) badRequest('对局不存在')
  if (room.status !== 'playing') badRequest('对局不在进行中')
  if (room.host_id !== user.id && room.player_id !== user.id)
    throw new HTTPError(403, '非对局参与者')

  const winnerId = room.host_id === user.id ? room.player_id : room.host_id
  const now = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(
    'UPDATE game_rooms SET status = ?, updated_at = ? WHERE id = ?',
  ).bind('finished', now, roomId).run()
  await c.env.DB.prepare(
    `INSERT INTO game_histories (room_id, game_id, player_id, opponent_id, winner, moves, duration)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  ).bind(roomId, room.game_id, user.id, winnerId!, 'resign', now - Math.floor(Number(room.created_at))).run()

  return c.json({ ok: true, winner: winnerId })
})

app.delete('/api/rooms/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const roomId = c.req.param('id')
  const room = await c.env.DB.prepare(
    'SELECT id, host_id, player_id, status, game_id FROM game_rooms WHERE id = ?',
  ).bind(roomId).first()
  if (!room) badRequest('对局不存在')
  if (room.host_id !== user.id && room.player_id !== user.id)
    throw new HTTPError(403, '非对局参与者')
  if (room.status === 'waiting') {
    await c.env.DB.prepare('DELETE FROM game_rooms WHERE id = ?').bind(roomId).run()
  } else if (room.status === 'playing') {
    const winnerId = room.host_id === user.id ? room.player_id : room.host_id
    const now = Math.floor(Date.now() / 1000)
    await c.env.DB.prepare('UPDATE game_rooms SET status = ?, updated_at = ? WHERE id = ?').bind('finished', now, roomId).run()
    await c.env.DB.prepare(
      `INSERT INTO game_histories (room_id, game_id, player_id, opponent_id, winner, moves, duration)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    ).bind(roomId, room.game_id, user.id, winnerId!, 'leave', now - Math.floor(Number(room.created_at))).run()
  }
  return c.json({ ok: true })
})

app.get('/api/friends/match-history', requireAuth, async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT game_id, opponent_id, winner, moves, duration, created_at AS createdAt,
            u.username AS opponentName
     FROM game_histories gh JOIN users u ON u.id = gh.opponent_id
     WHERE gh.player_id = ? ORDER BY created_at DESC LIMIT 50`,
  ).bind(user.id).all<{
    game_id: string; opponent_id: string; winner: string | null; moves: number
    duration: number; createdAt: number; opponentName: string | null
  }>()
  return c.json({ history: results ?? [] })
})

// ---------- 棋类 AI 走法建议 ----------

/** 从 LLM 原始输出里抽出候选走法字符串数组（容忍 ```json 围栏与前后杂文） */
function parseAiCandidates(raw: string, legal: Set<string>, want: number): string[] {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const arr = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(arr)) return []
    const out: string[] = []
    for (const v of arr) {
      if (typeof v !== 'string') continue
      const t = v.trim()
      if (!legal.has(t) || out.includes(t)) continue
      out.push(t)
      if (out.length >= want) break
    }
    return out
  } catch {
    return []
  }
}

/** 生成候选走法的提示词：约束模型只能从合法清单里原样挑选 */
function buildAiPrompt(game: string, legal: string[], want: number): string {
  return (
    `你是${AI_GAME_LABEL[game]}特级大师引擎。下面是当前局面的全部合法走法，请选出最值得考虑的 ${want} 步，` +
    `按优劣排序，最优选在前。\n\n` +
    `合法走法清单（只能从这里原样挑选，不得新增、不得改写）：\n${legal.join('\n')}\n\n` +
    `要求：只输出一个 JSON 数组，元素为走法字符串，数量 ${want}，无多余文字。例如 ["e2e4"]`
  )
}

/**
 * 构造 chat/completions 请求体。
 *
 * 各网关关闭推理的参数名不统一：sensenova/deepseek/glm 认 reasoning_effort，kimi 认 thinking，
 * 所以关闭时两个都下发（未识别的会被忽略）。开启时只下发 thinking——实测 reasoning_effort:'high'
 * 会把 sensenova flash-lite 的全部 3000 token 预算烧在推理上、正文返回为空。
 */
function buildChatBody(
  model: string,
  temperature: number,
  reasoning: boolean,
  prompt: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    temperature,
    max_tokens: reasoning ? AI_MAX_TOKENS_REASONING : AI_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  }
  if (reasoning) {
    body.thinking = { type: 'enabled' }
  } else {
    body.reasoning_effort = 'none'
    body.thinking = { type: 'disabled' }
  }
  return body
}

/** 调用 OpenAI 兼容 chat/completions。返回模型正文；HTTP 非 2xx 或空正文返回 null。 */
async function askApiModel(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  temperature: number,
  reasoning: boolean,
): Promise<string | null> {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildChatBody(model, temperature, reasoning, prompt)),
    signal: AbortSignal.timeout(reasoning ? AI_REASONING_TIMEOUT_MS : AI_TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: unknown } }>; error?: unknown }
    | null
  if (!res.ok) {
    console.warn(`ai http ${res.status}:`, JSON.stringify(data?.error ?? data).slice(0, 300))
    return null
  }
  const content = data?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : null
}

interface WorkersAiBinding {
  run: (model: string, data: unknown) => Promise<{ json(): Promise<unknown> }>
}

/** 调用 Workers AI 内建绑定。未开通 Workers AI 时 run 不存在，返回 null 由上层回落本地。 */
async function askWorkersAi(
  ai: unknown,
  model: string,
  prompt: string,
  temperature: number,
): Promise<string | null> {
  const runner = (ai ?? {}) as Partial<WorkersAiBinding>
  if (typeof runner.run !== 'function') return null
  const res = await runner.run(model, {
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: AI_MAX_TOKENS,
  })
  const data = (await res.json()) as { content?: Array<{ text?: unknown }> } | null
  const text = data?.content?.[0]?.text
  return typeof text === 'string' ? text : null
}

/** 公开站点配置：客户端据此决定是否渲染 Turnstile */
app.get('/api/config', async (c) => {
  return c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null })
})

/**
 * AI 候选走法。无需登录：登录账号凭 Cookie 放行，游客凭 deviceId + Turnstile 放行，无步数上限。
 * 任何异常都返回 engine:'local'，由客户端回落本地 AI，保证对局永不卡住。
 */
app.post('/api/ai/move', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { game, level, legalMoves, side, deviceId, turnstileToken } = body as Record<string, unknown>

  if (typeof game !== 'string' || !AI_GAMES.has(game)) badRequest('无效棋种')
  if (level !== 'medium' && level !== 'hard') badRequest('仅支持 medium / hard')
  if (!Array.isArray(legalMoves) || legalMoves.length === 0) badRequest('没有可用走法')
  if (legalMoves.length > AI_MAX_LEGAL_MOVES) badRequest('走法数量过多')
  const legal = legalMoves.filter((v): v is string => typeof v === 'string')
  if (legal.length === 0) badRequest('没有可用走法')
  if (typeof side !== 'string' || side.length > 8) badRequest('无效走方')

  // 身份：有效登录态优先；否则接受格式合法的设备 ID 作为游客身份
  const authCookie = getCookie(c, COOKIE_NAME)
  const payload = authCookie ? await verifyToken(authCookie, c.env.JWT_SECRET) : null
  const account = payload ? await loadUser(c.env.DB, payload.uid) : null

  const owner: { id: string; identity: 'user' | 'guest' } | null =
    account && !account.is_banned
      ? { id: account.id, identity: 'user' }
      : typeof deviceId === 'string' &&
          deviceId.length <= DEVICE_ID_MAX &&
          DEVICE_ID_RE.test(deviceId)
        ? { id: AI_GUEST_PREFIX + deviceId.toLowerCase(), identity: 'guest' }
        : null

  const settings = await loadAiSettings(c.env.DB)
  const modelList = settings.provider === 'cloudflare' ? AI_CF_MODELS : AI_API_MODELS
  const modelId = settings.provider === 'cloudflare' ? settings.cfModel : settings.apiModel
  const identity = owner ? owner.identity : 'none'
  const reply = (engine: 'cf' | 'local', candidates: string[]): Response =>
    c.json({ ok: true, engine, candidates, model: modelId, identity })

  // 身份无法识别、提供方关闭、或 API 凭据缺失：回落本地，不产生费用
  if (!owner || settings.provider === 'off') return reply('local', [])
  if (settings.provider === 'api' && !aiCapabilities(c.env).api.configured) {
    return reply('local', [])
  }

  // 游客必须过 Turnstile；secret 未配置视为站点未启用，游客一律回落本地
  if (owner.identity === 'guest') {
    const secret = c.env.TURNSTILE_SECRET ?? ''
    const passed =
      secret.length > 0 &&
      typeof turnstileToken === 'string' &&
      turnstileToken.length > 0 &&
      turnstileToken.length <= TURNSTILE_TOKEN_MAX &&
      (await verifyTurnstile(
        secret,
        turnstileToken,
        c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? '',
      ))
    if (!passed) return reply('local', [])
  }

  const want = AI_CANDIDATES[level]
  const legalSet = new Set(legal)
  const prompt = buildAiPrompt(game, legal.slice(0, AI_MAX_LEGAL_MOVES), want)
  const temperature = modelTemperature(modelId, modelList, AI_TEMPERATURE[level])

  let raw: string | null
  try {
    raw = settings.provider === 'cloudflare'
      ? await askWorkersAi(c.env.AI, settings.cfModel, prompt, temperature)
      : await askApiModel(
          (c.env.AI_BASE_URL ?? '').trim(),
          (c.env.AI_API_KEY ?? '').trim(),
          settings.apiModel,
          prompt,
          temperature,
          settings.reasoning,
        )
  } catch (err) {
    // 调用失败（含超时）：回落本地
    console.warn('ai request failed:', err)
    return reply('local', [])
  }
  if (raw === null) return reply('local', [])

  const candidates = parseAiCandidates(raw, legalSet, want)
  // 输出里没有一个合法候选：回落本地
  return candidates.length === 0 ? reply('local', []) : reply('cf', candidates)
})

// ---------- 管理员：AI 设置 ----------

const AI_TEST_LEGAL_MOVES = ['e2e4', 'd2d4', 'g1f3', 'b1c3', 'f1e2', 'c2c4', 'e2e3', 'd2d3']
const AI_TEST_PROMPT = buildAiPrompt('chess', AI_TEST_LEGAL_MOVES, 3)

/** 读取当前 AI 配置，并返回两个提供方的模型目录与可用性 */
app.get('/api/admin/settings/ai', requireAuth, requireAdmin, async (c) => {
  return c.json({
    settings: await loadAiSettings(c.env.DB),
    apiModels: AI_API_MODELS,
    cfModels: AI_CF_MODELS,
    capabilities: aiCapabilities(c.env),
  })
})

/** 保存 AI 配置。省略的字段保留原值。 */
app.put('/api/admin/settings/ai', requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { provider, apiModel, cfModel, reasoning } = body as Record<string, unknown>

  if (provider !== undefined && !AI_PROVIDERS.includes(provider as AiProvider)) {
    badRequest('无效 AI 提供方')
  }
  if (apiModel !== undefined && !AI_API_MODELS.some((m) => m.id === apiModel)) {
    badRequest('无效 AI 模型')
  }
  if (cfModel !== undefined && !AI_CF_MODELS.some((m) => m.id === cfModel)) {
    badRequest('无效 Workers AI 模型')
  }
  if (reasoning !== undefined && typeof reasoning !== 'boolean') {
    badRequest('推理开关无效')
  }

  const current = await loadAiSettings(c.env.DB)
  const next: AiSettings = {
    provider: provider === undefined ? current.provider : (provider as AiProvider),
    apiModel: apiModel === undefined ? current.apiModel : (apiModel as string),
    cfModel: cfModel === undefined ? current.cfModel : (cfModel as string),
    reasoning: reasoning === undefined ? current.reasoning : (reasoning as boolean),
  }

  const rows: Array<[string, string]> = [
    [SETTING_KEYS.provider, next.provider],
    [SETTING_KEYS.apiModel, next.apiModel],
    [SETTING_KEYS.cfModel, next.cfModel],
    [SETTING_KEYS.reasoning, next.reasoning ? 'on' : 'off'],
  ]
  await Promise.all(
    rows.map(([k, v]) =>
      c.env.DB.prepare(
        'INSERT INTO site_settings (key, value) VALUES (?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).bind(k, v).run(),
    ),
  )

  return c.json({ settings: next, capabilities: aiCapabilities(c.env) })
})

/** 用当前配置真实调用一次模型，让管理员在切换前确认它确实可用 */
app.post('/api/admin/settings/ai/test', requireAuth, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const current = await loadAiSettings(c.env.DB)

  let provider: AiProvider = current.provider
  if (body.provider !== undefined) {
    if (!AI_PROVIDERS.includes(body.provider as AiProvider)) badRequest('无效 AI 提供方')
    provider = body.provider as AiProvider
  }
  const apiModel = pickModel(AI_API_MODELS, body.apiModel, current.apiModel)
  const cfModel = pickModel(AI_CF_MODELS, body.cfModel, current.cfModel)
  const reasoning = body.reasoning === undefined ? current.reasoning : body.reasoning === true
  const modelId = provider === 'cloudflare' ? cfModel : apiModel

  const start = Date.now()
  const temperature = AI_TEMPERATURE.hard
  let raw: string | null
  try {
    if (provider === 'cloudflare') {
      raw = await askWorkersAi(c.env.AI, cfModel, AI_TEST_PROMPT, temperature)
    } else if (provider === 'off') {
      return c.json({ ok: false, provider, model: modelId, error: '当前提供方已关闭，未发起调用' })
    } else {
      const baseUrl = (c.env.AI_BASE_URL ?? '').trim()
      const apiKey = (c.env.AI_API_KEY ?? '').trim()
      if (!baseUrl || !apiKey) {
        return c.json({
          ok: false, provider, model: modelId,
          error: 'API 凭据未配置（AI_BASE_URL / AI_API_KEY）',
        })
      }
      raw = await askApiModel(baseUrl, apiKey, apiModel, AI_TEST_PROMPT, temperature, reasoning)
    }
  } catch (err) {
    console.warn('ai test failed:', err)
    return c.json({ ok: false, provider, model: modelId, error: '调用失败或超时' })
  }

  if (raw === null) {
    return c.json({ ok: false, provider, model: modelId, error: '模型返回空正文或 HTTP 错误' })
  }
  const parsed = parseAiCandidates(raw, new Set(AI_TEST_LEGAL_MOVES), 3)
  return c.json({
    ok: parsed.length > 0,
    provider,
    model: modelId,
    reasoning,
    ms: Date.now() - start,
    parsed,
    raw: raw.slice(0, 300),
  })
})

// ---------- 管理员网盘 ----------

const STORAGE_LIMIT = 100 * 1024 * 1024 // 100MB
const CHUNK_RAW_SIZE = 400 * 1024        // 400KB raw per chunk

/** ArrayBuffer → base64 string (for chunk storage) */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[])
  }
  return btoa(bin)
}

app.get('/api/admin/files/storage', requireAuth, requireAdmin, async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(size), 0) AS used FROM files',
  ).first<{ used: number }>()
  const used = row?.used ?? 0
  return c.json({ used, limit: STORAGE_LIMIT, percent: Math.round((used / STORAGE_LIMIT) * 10000) / 100 })
})

app.post('/api/admin/files', requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) badRequest('请求体格式错误')
  const { filename, data, contentType } = (body ?? {}) as Record<string, unknown>
  if (typeof filename !== 'string' || filename.length < 1 || filename.length > 255)
    badRequest('文件名无效')
  if (typeof data !== 'string' || data.length < 1)
    badRequest('文件数据为空')
  const mimeType = typeof contentType === 'string' && contentType.length > 0 ? contentType : 'application/octet-stream'

  // Check storage limit
  const storageRow = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(size), 0) AS used FROM files',
  ).first<{ used: number }>()
  const used = storageRow?.used ?? 0

  // Decode base64 to get raw size
  let rawBytes: Uint8Array
  try {
    const bin = atob(data)
    rawBytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) rawBytes[i] = bin.charCodeAt(i)
  } catch {
    badRequest('base64 数据无效')
  }

  const fileSize = rawBytes.length
  if (fileSize > 5 * 1024 * 1024) badRequest('单个文件不能超过 5MB')
  if (used + fileSize > STORAGE_LIMIT) badRequest(`存储空间不足，已用 ${used}B，上限 ${STORAGE_LIMIT}B`)

  // Split into chunks
  const chunks: string[] = []
  for (let offset = 0; offset < fileSize; offset += CHUNK_RAW_SIZE) {
    const slice = rawBytes.subarray(offset, Math.min(offset + CHUNK_RAW_SIZE, fileSize))
    chunks.push(arrayBufferToBase64(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)))
  }

  // Insert file metadata
  const fileResult = await c.env.DB.prepare(
    'INSERT INTO files (filename, content_type, size, total_chunks) VALUES (?, ?, ?, ?)',
  ).bind(filename, mimeType, fileSize, chunks.length).run()

  const fileId = Number(fileResult.meta.last_row_id)

  // Insert chunks in parallel
  const chunkInserts = chunks.map((data, i) =>
    c.env.DB.prepare(
      'INSERT INTO file_chunks (file_id, chunk_index, data) VALUES (?, ?, ?)',
    ).bind(fileId, i, data).run(),
  )
  await Promise.all(chunkInserts)

  return c.json({ ok: true, fileId, size: fileSize, chunks: chunks.length })
})

app.get('/api/admin/files', requireAuth, requireAdmin, async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 100, 500)
  const { results } = await c.env.DB.prepare(
    'SELECT id, filename, content_type AS contentType, size, total_chunks AS totalChunks, created_at AS createdAt FROM files ORDER BY created_at DESC LIMIT ?',
  ).bind(limit).all<{
    id: number; filename: string; contentType: string; size: number
    totalChunks: number; createdAt: number
  }>()
  return c.json({ files: results ?? [] })
})

app.get('/api/admin/files/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) badRequest('无效文件 ID')

  const file = await c.env.DB.prepare(
    'SELECT id, filename, content_type AS contentType, size, total_chunks AS totalChunks FROM files WHERE id = ?',
  ).bind(id).first<{ id: number; filename: string; contentType: string; size: number; totalChunks: number }>()
  if (!file) throw new HTTPError(404, '文件不存在')

  // Fetch all chunks
  const { results } = await c.env.DB.prepare(
    'SELECT data FROM file_chunks WHERE file_id = ? ORDER BY chunk_index',
  ).bind(id).all<{ data: string }>()

  if (!results || results.length !== file.totalChunks) throw new HTTPError(500, '文件数据不完整')

  // Reassemble
  const parts: Uint8Array[] = []
  for (const chunk of results) {
    const bin = atob(chunk.data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    parts.push(bytes)
  }

  const totalLen = parts.reduce((s, p) => s + p.length, 0)
  const buf = new Uint8Array(totalLen)
  let off = 0
  for (const part of parts) {
    buf.set(part, off)
    off += part.length
  }

  return new Response(buf.buffer, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
      'Content-Length': String(totalLen),
      'Cache-Control': 'private, max-age=300',
    },
  })
})

app.delete('/api/admin/files/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) badRequest('无效文件 ID')
  await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run()
  // chunks are cascade-deleted
  return c.json({ ok: true })
})

app.notFound((c) => c.json({ error: '接口不存在' }, 404))

export default app
