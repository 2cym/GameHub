/**
 * Cloudflare Turnstile 人机验证（非交互模式）。
 *
 * 仅游客调用付费 AI 时使用：游客没有账号背书，靠这个把人机区分开，
 * 而不是降低他们的额度。登录账号不需要 token。
 *
 * 失败策略是「静默返回 null」，由调用方决定回落本地 AI——
 * 验证脚本加载不了、challenge 需要人工介入、或超时，都不能让对局卡住。
 */

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
/** 脚本加载上限；国内网络可能拉不下来，超时即回落本地 AI */
const LOAD_TIMEOUT_MS = 8000
/** token 生成上限；隐形模式下通常毫秒级就绪，超时说明需要人工介入 */
const TOKEN_TIMEOUT_MS = 8000
const POLL_INTERVAL_MS = 200

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, string>): string
  getResponse(wid: string): string
  reset(wid: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    __gameHubTurnstileReady?: (api: TurnstileApi) => void
  }
}

let widgetId: string | null = null
let container: HTMLDivElement | null = null
let loaderPromise: Promise<TurnstileApi | null> | null = null

function loadScript(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loaderPromise) return loaderPromise
  loaderPromise = new Promise((resolve) => {
    let settled = false
    const finish = (api: TurnstileApi | null) => {
      if (settled) return
      settled = true
      resolve(api)
    }
    window.__gameHubTurnstileReady = (api) => finish(api)
    const timer = window.setTimeout(() => finish(null), LOAD_TIMEOUT_MS)
    const script = document.createElement('script')
    script.src = `${TURNSTILE_SCRIPT}?render=explicit&onload=__gameHubTurnstileReady`
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timer)
      finish(null)
    }
    document.head.appendChild(script)
  })
  return loaderPromise
}

/**
 * 取一个可用的 Turnstile token。
 * @param siteKey 由服务端下发，为空表示站点未启用人机验证
 * @param action  区分触发场景，便于在 Turnstile 后台按场景审计
 */
export async function getTurnstileToken(siteKey: string, action: string): Promise<string | null> {
  if (!siteKey) return null
  try {
    const api = await loadScript()
    if (!api) return null
    if (!container) {
      container = document.createElement('div')
      // 隐形模式不渲染可见 UI，移出可视区即可
      container.style.cssText = 'position:fixed;left:-9999px;top:0;'
      const host = document.body ?? document.documentElement
      host.appendChild(container)
    }
    if (widgetId !== null) {
      api.reset(widgetId)
    } else {
      widgetId = api.render(container, {
        sitekey: siteKey,
        action,
        size: 'invisible',
      })
    }
    const deadline = Date.now() + TOKEN_TIMEOUT_MS
    const wid = widgetId
    while (Date.now() < deadline) {
      const token = api.getResponse(wid)
      if (token) return token
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, POLL_INTERVAL_MS)
      })
    }
    return null
  } catch {
    return null
  }
}
