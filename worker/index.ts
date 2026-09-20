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
  return c.json({ user })
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
  return c.json({
    db: dbOk ? 'connected' : 'disconnected',
    jwtSecret: Boolean(c.env.JWT_SECRET) ? 'configured' : 'MISSING',
    resendKey: Boolean(c.env.RESEND_API_KEY) ? 'configured' : 'NOT_SET',
    adminEmail: c.env.ADMIN_EMAIL ?? 'NOT_SET',
    mailFrom: c.env.MAIL_FROM ?? 'default',
    workerVersion: process.env.WORKER_VERSION ?? 'unknown',
  })
})

app.notFound((c) => c.json({ error: '接口不存在' }, 404))

export default app
