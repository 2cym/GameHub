/**
 * 邮件发送：Cloudflare Workers 不支持 SMTP（无原始 TCP），走 Resend HTTP API。
 * 未配置 RESEND_API_KEY 时为 mock 模式：内容打印到 Worker 控制台，供本地开发。
 */

import { HTTPError } from './errors'

export interface MailEnv {
  RESEND_API_KEY?: string
  MAIL_FROM?: string
}

/** Resend 官方测试发件地址，未验证自有域名前只能发给 Resend 账号本人的邮箱 */
const DEFAULT_FROM = 'GameHub <onboarding@resend.dev>'

export function mailMockMode(env: MailEnv): boolean {
  return !env.RESEND_API_KEY
}

/**
 * 发送邮件。返回值区分模式：true=Resend 已发送，false=mock（未真正发送）。
 * Resend 调用失败抛 HTTPError(502)。
 */
export async function sendMail(
  env: MailEnv,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (mailMockMode(env)) {
    console.log(`[mail:mock] to=${to} subject=${subject}\n${html}`)
    return false
  }

  const res = await fetch('https://api.resend.com/emails', {
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
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`resend send failed: ${res.status} ${detail.slice(0, 300)}`)
    throw new HTTPError(502, '邮件发送失败，请稍后再试')
  }
  return true
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
