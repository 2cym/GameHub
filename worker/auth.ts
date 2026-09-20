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
  const header = b64urlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64urlEncode(
    encoder.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL })),
  )
  const data = `${header}.${body}`
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data))
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`
}

export interface TokenPayload {
  uid: string
  exp: number
  admin?: boolean
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<TokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    b64urlDecode(sig),
    encoder.encode(`${header}.${body}`),
  )
  if (!ok) return null
  try {
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
