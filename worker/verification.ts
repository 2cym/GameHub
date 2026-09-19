/**
 * 邮箱验证码：生成、签发、校验。注册与重置密码共用一张表。
 * 安全策略：仅存 PBKDF2 哈希；10 分钟有效；错 5 次作废；60 秒重发冷却；校验成功即删除（单次有效）。
 */

import { hashPassword, randomSalt } from './auth'
import { HTTPError } from './errors'

export type CodePurpose = 'register' | 'reset'

const CODE_TTL = 10 * 60
const RESEND_COOLDOWN = 60
const MAX_ATTEMPTS = 5

/** 6 位数字验证码（拒绝采样消除模偏差） */
export function generateCode(): string {
  const buf = new Uint32Array(1)
  do {
    crypto.getRandomValues(buf)
  } while (buf[0] >= 4_294_000_000)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

export async function deleteCode(
  db: D1Database,
  email: string,
  purpose: CodePurpose,
): Promise<void> {
  await db
    .prepare('DELETE FROM email_verifications WHERE email = ? AND purpose = ?')
    .bind(email, purpose)
    .run()
}

/** 签发验证码（覆盖旧码），60 秒重发冷却。返回明文验证码（仅供发信用）。 */
export async function issueCode(
  db: D1Database,
  email: string,
  purpose: CodePurpose,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const last = await db
    .prepare(
      'SELECT created_at FROM email_verifications WHERE email = ? AND purpose = ?',
    )
    .bind(email, purpose)
    .first<{ created_at: number }>()
  if (last && now - last.created_at < RESEND_COOLDOWN) {
    throw new HTTPError(429, `发送太频繁了，请 ${RESEND_COOLDOWN} 秒后再试`)
  }

  const code = generateCode()
  const salt = randomSalt()
  const codeHash = await hashPassword(code, salt)
  await db
    .prepare(
      `INSERT INTO email_verifications
         (email, purpose, code_hash, salt, attempts, expires_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT (email, purpose) DO UPDATE SET
         code_hash = excluded.code_hash,
         salt = excluded.salt,
         attempts = 0,
         expires_at = excluded.expires_at,
         created_at = excluded.created_at`,
    )
    .bind(email, purpose, codeHash, salt, now + CODE_TTL, now)
    .run()
  return code
}

/** 校验验证码：通过即删除；失败抛 HTTPError 并累计错误次数 */
export async function verifyCode(
  db: D1Database,
  email: string,
  purpose: CodePurpose,
  code: string,
): Promise<void> {
  const row = await db
    .prepare(
      'SELECT code_hash, salt, attempts, expires_at FROM email_verifications WHERE email = ? AND purpose = ?',
    )
    .bind(email, purpose)
    .first<{ code_hash: string; salt: string; attempts: number; expires_at: number }>()

  const now = Math.floor(Date.now() / 1000)
  if (!row || row.expires_at < now) {
    await deleteCode(db, email, purpose)
    throw new HTTPError(400, '验证码错误或已过期，请重新获取')
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await deleteCode(db, email, purpose)
    throw new HTTPError(400, '错误次数过多，请重新获取验证码')
  }

  const hash = await hashPassword(code, row.salt)
  if (hash !== row.code_hash) {
    await db
      .prepare(
        'UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ? AND purpose = ?',
      )
      .bind(email, purpose)
      .run()
    throw new HTTPError(400, '验证码错误')
  }

  await deleteCode(db, email, purpose)
}
