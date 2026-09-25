const KEY = 'gamehub_device_id'

/**
 * 游客身份标识：本机持久化的 32 位十六进制随机值。
 * 游客使用 Cloudflare AI 时按此标识记账（按设备而非账号），
 * 因此「游客和普通账号一样」的每日额度是按设备分摊的。
 * localStorage 不可用（隐私模式等）时退化为会话内随机值，额度随之按会话计算。
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
