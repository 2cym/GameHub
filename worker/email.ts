/**
 * 邮件发送：Cloudflare Workers 不支持 SMTP（无原始 TCP），通过 Resend REST API 发信。
 * API Key 只从环境变量 RESEND_API_KEY 读取，不写入代码。
 */

import { HTTPError } from './errors'

export interface MailEnv {
  RESEND_API_KEY?: string
  MAIL_FROM?: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const ALLOWED_HOSTS = new Set(['api.resend.com'])

/** Resend 官方测试发件地址，未验证自有域名前只能发给 Resend 账号本人的邮箱 */
const DEFAULT_FROM = 'GameHub <onboarding@resend.dev>'

/** 出站请求只允许 https 且 host 在白名单内，拒绝 localhost / 环回 / 私有地址 */
function assertAllowedFetchUrl(raw: string): void {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new HTTPError(500, '邮件服务配置异常')
  }
}

/** 发信能力是否就绪：仅要求已配置密钥 */
export function emailServiceReady(env: MailEnv): boolean {
  return Boolean(env.RESEND_API_KEY)
}

/**
 * 发送验证码邮件。未配置密钥抛 502，Resend 返回非 2xx 也抛 502。
 */
export async function sendMail(
  env: MailEnv,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new HTTPError(502, '邮件服务未配置，请联系管理员')
  }
  assertAllowedFetchUrl(RESEND_ENDPOINT)

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text: verificationText(subject, html),
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`resend send failed: ${res.status} ${detail.slice(0, 300)}`)
    throw new HTTPError(502, '邮件发送失败，请稍后再试')
  }
}

/** 从 HTML 模板里取出验证码，生成纯文本版本，兼容只渲染 text 的客户端 */
function verificationText(_subject: string, html: string): string {
  const match = html.match(/letter-spacing:8px[^>]*>(\d{6})</)
  const code = match ? match[1] : '（见邮件正文）'
  return `GameHub 验证码：${code}，10 分钟内有效。如非本人操作，请忽略本邮件。`
}

/** 验证码邮件模板（内联样式，兼容各客户端） */
export function verificationEmailHtml(code: string, minutes: number): string {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:24px;background:#f4f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">GameHub 验证码</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">你正在进行身份验证，请使用以下验证码：</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#7c5cff;background:#f3f0ff;border-radius:8px;padding:16px;text-align:center;">${code}</div>
      <p style="margin:24px 0 0;font-size:13px;color:#999;line-height:1.6;">验证码 ${minutes} 分钟内有效，超时请重新获取。<br>如非本人操作，请忽略本邮件。</p>
    </div>
  </body>
</html>`
}
