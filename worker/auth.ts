/**
 * Worker 端认证工具：PBKDF2 加盐哈希 + HMAC-SHA256 JWT（HttpOnly Cookie）。
 */

const PBKDF2_ITERATIONS = 100_000
const KEY_LENGTH = 32
const TOKEN_TTL = 60 * 60 * 24 * 30 // 30 天

const encoder = new TextEncoder()

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return b64urlEncode(bytes)
}

export async function hashPassword(
  password: string,
  salt: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: b64urlDecode(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    KEY_LENGTH * 8,
  )
  return b64urlEncode(new Uint8Array(bits))
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64urlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64urlEncode(
    // iat 是令牌签发时刻，改密码/被重置时据此吊销所有早于该时刻的旧令牌
    encoder.encode(JSON.stringify({ ...payload, iat: now, exp: now + TOKEN_TTL })),
  )
  const data = `${header}.${body}`
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data))
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`
}

export interface TokenPayload {
  uid: string
  exp: number
  /** 签发时刻（秒）。上线前的旧令牌没有此字段，视为「未知」按最早签发处理。 */
  iat?: number
  admin?: boolean
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<TokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  try {
    // b64urlDecode 对畸形字符会抛异常，必须纳入 catch：
    // 否则伪造/损坏的 Cookie 会让 verifyToken 抛错、把 401 变成 500
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      b64urlDecode(sig),
      encoder.encode(`${header}.${body}`),
    )
    if (!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    if (
      typeof payload.uid !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null
    }
    return payload as TokenPayload
  } catch {
    return null
  }
}

export function newUserId(): string {
  return crypto.randomUUID()
}

export const COOKIE_NAME = 'gamehub_token'

/**
 * 令牌 Cookie 统一属性：所有签发/注销都必须走这里，避免漏配 secure。
 * secure: true 让浏览器只在 HTTPS 下发送，明文 HTTP 泄露时无用。
 */
export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'Lax',
  secure: true,
  path: '/',
} as const

/**
 * 失效用户的全部旧令牌：把「密码变更时刻」记下来。
 * 之后 requireAuth 对比 token.iat 与此时刻，早于该时刻的令牌一律拒绝。
 * 用独立表而非给 users 加列——全库没有 ALTER TABLE 先例。
 */
export async function recordPasswordChange(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO user_password_changes (user_id, changed_at) VALUES (?, unixepoch()) ' +
        'ON CONFLICT(user_id) DO UPDATE SET changed_at = unixepoch()',
    )
    .bind(userId)
    .run()
}

/**
 * 该用户的令牌是否已被吊销：密码在令牌签发之后被改过即吊销。
 * token 无 iat（上线前的旧令牌）按最早签发处理，一改密码就作废——这是安全侧的默认。
 */
export async function isTokenRevoked(
  db: D1Database,
  userId: string,
  iat: number | undefined,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT changed_at FROM user_password_changes WHERE user_id = ?')
    .bind(userId)
    .first<{ changed_at: number }>()
  if (!row) return false
  return row.changed_at > (iat ?? 0)
}
