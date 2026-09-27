const KEY = 'gamehub_device_id'

/**
 * 游客身份标识：本机持久化的 32 位十六进制随机值。
 * 游客没有账号，AI 请求用它标记身份。
 * localStorage 不可用（隐私模式等）时退化为会话内随机值。
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing
  } catch {
    // localStorage 不可用，忽略
  }
  const id = randomHex32()
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // 写入失败也不影响本次使用
  }
  return id
}

function randomHex32(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 游客在对局里的身份 id，与 worker 端 `AI_GUEST_PREFIX + deviceId` 保持一致 */
export function guestActorId(): string {
  return 'guest:' + getDeviceId()
}

// ---------- 游客昵称 ----------

const NAME_KEY = 'gamehub_guest_name'
const NAME_MAX = 12
// 必须与 worker/index.ts 的 ROOM_NAME_RE 保持一致（首字符不含空白，其余允许 · 和空格）
const NAME_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_·\s]{0,11}$/u

/** 读取已保存的游客昵称，未设置时返回空串 */
export function getGuestName(): string {
  try {
    const n = localStorage.getItem(NAME_KEY)
    if (n && NAME_RE.test(n)) return n
  } catch {
    // localStorage 不可用，忽略
  }
  return ''
}

/** 保存游客昵称；非法值原样返回空串（不写入），调用方走「游客xxxx」回落 */
export function setGuestName(name: string): string {
  const s = name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX)
  if (!s || !NAME_RE.test(s)) return ''
  try {
    localStorage.setItem(NAME_KEY, s)
  } catch {
    // 写入失败不影响本次使用
  }
  return s
}

/** 展示用的游客名：有昵称用昵称，否则用设备标识前 4 位兜底 */
export function guestDisplayName(deviceId: string): string {
  return getGuestName() || '游客' + deviceId.slice(0, 4)
}
