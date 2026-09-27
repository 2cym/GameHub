import { HTTPError } from './errors'

/**
 * IPv4 私网 / 环回 / 保留段：0/8、127/8、10/8、172.16/12、192.168/16、
 * 169.254/16（云元数据）、183.104/10、100.64/10。
 *
 * 拆成数组而不是一个超长 alternation：正则字面量不能用 + 拼接，
 * 而且这样每段可以单独标注释明是哪个地址段。
 */
const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^(?:0|127)(?:\.\d{1,3}){3}$/,
  /^10(?:\.\d{1,3}){3}$/,
  /^192\.168(?:\.\d{1,3}){2}$/,
  /^(?:169\.254|183\.104)(?:\.\d{1,3}){2}$/,
  /^(?:172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){2}$/,
  /^(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))(?:\.\d{1,3}){2}$/,
]

export function isPrivateIpv4(host: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((re) => re.test(host))
}

/**
 * 服务端出站 URL 校验：只放行指向公网的 https 地址。
 *
 * AI_BASE_URL 是管理配置项，一旦写成内网地址，Worker 就能从公网身份打穿到
 * 云元数据服务（169.254.169.254 返回凭据）或内网机器。
 *
 * 已知边界：Workers 运行时没有 DNS 解析 API，这里只能拦「字面量形式」的内网地址。
 * 域名若被 DNS 解析成私网 IP（nip.io / sslip.io 这类服务），这一层拦不住。
 * 因此这里是纵深防御的入口检查，不是完整的 SSRF 防护。
 *
 * 调用方注意：WHATWG URL 会先规范化主机（`2130706433` → `127.0.0.1`、
 * `0x7f.0.0.1` → `127.0.0.1`），下面的判断都是针对规范化后的 hostname。
 */
export function isPublicHttpsUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host) return false

  // 本机 / 内网主机名：fetch 会把它们解析到环回或 mDNS
  if (host === 'localhost' || /\.localhost$/i.test(host)) return false
  if (/(?:\.local|\.internal)$/i.test(host)) return false

  // IPv6 字面量（URL 解析后已无方括号）
  if (host.includes(':')) {
    if (/^::1$/.test(host)) return false // 环回
    if (/^::$/.test(host)) return false // 未指定
    if (/^fe[89ab][0-9a-f]{0,3}:/.test(host)) return false // 链路本地 fe80::/10
    if (/^fc[0-9a-f]{0,3}:/.test(host) || /^fd[0-9a-f]{0,3}:/.test(host)) return false // ULA fc00::/7
    // IPv4 映射地址 ::ffff:0:0/96。URL 解析器会把 ::ffff:127.0.0.1 规范化成
    // 十六进制形式，所以这里按整段拒绝——公网 AI 端点不会用映射地址。
    if (/^::ffff:/i.test(host)) return false
    return true
  }

  return !isPrivateIpv4(host)
}

/** 出站前调用：配置指到内网或非 https 地址时直接拒绝，不让请求发出去 */
export function assertPublicHttpsUrl(raw: string): void {
  if (!isPublicHttpsUrl(raw)) {
    // 配置错误而不是瞬时失败，抛错让调用方能明确看到原因
    console.error('outbound url rejected:', raw)
    throw new HTTPError(500, 'AI 服务地址配置异常')
  }
}
