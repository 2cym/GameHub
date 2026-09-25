import { aiApi, configApi, type AiGame, type AiMoveResponse } from '../../lib/api'
import { getDeviceId } from '../../lib/deviceId'
import { getTurnstileToken } from '../../lib/turnstile'
import { useAuth } from '../../stores/auth'

/** 与各游戏 logic 里的难度枚举保持一致 */
export type Difficulty = 'easy' | 'medium' | 'hard'

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

/** 本地引擎在"简单"档下模拟的思考停顿（沿用原 setTimeout 节奏） */
const EASY_DELAY = 350

let deviceIdCache: string | null = null
let siteKeyCache: string | null = null
let siteKeyLoaded = false

const deviceId = (): string => (deviceIdCache ??= getDeviceId())

/** 取 Turnstile 站点密钥；只在成功时缓存，配置变更后刷新页面即生效 */
async function turnstileSiteKey(): Promise<string | null> {
  if (siteKeyLoaded) return siteKeyCache
  let key: string | null = null
  try {
    key = (await configApi.get()).turnstileSiteKey || null
  } catch {
    // 网络异常按未配置处理
  }
  siteKeyCache = key
  siteKeyLoaded = true
  return key
}

export interface AiEngineResult<T> {
  move: T | null
  /** cf = 采用了 Workers AI 的候选；local = 走了本地 AI */
  engine: 'cf' | 'local'
}

/**
 * 一条合法走法的可交换表示：
 * - text：发给/收到自 LLM 的紧凑文本；
 * - move：客户端本地可直接执行的完整走法对象（保留 castle / enPassant / promo 等标记）。
 */
export interface LegalEntry<T> {
  text: string
  move: T
}

export interface AiEngineOptions<T> {
  game: AiGame
  level: Difficulty
  legal: Array<LegalEntry<T>>
  side: string
  /** 在候选集合内做本地搜索，选出最优一步 */
  search: (pool: T[]) => T | null
  /** 本地 AI 一步（简单档直接用它；中等/困难失败时回落它） */
  local: () => T | null
}

/**
 * 取一步 AI 走法：
 * - 简单：等一小会儿走本地 AI，不产生费用；
 * - 中等/困难：请求 Workers AI 候选，本地搜索精筛；
 * - 游客需先过 Turnstile；额度、超时、LLM 无合法输出等任何失败都回落本地 AI，保证对局不中断。
 */
export async function aiEngineMove<T>(opts: AiEngineOptions<T>): Promise<AiEngineResult<T>> {
  const { game, level, legal, side, search, local } = opts

  if (level === 'easy') {
    await sleep(EASY_DELAY)
    return { move: local(), engine: 'local' }
  }
  if (legal.length === 0) return { move: null, engine: 'local' }

  // 游客没有账号背书，用 Turnstile 把人机区分开；登录账号凭 Cookie 直接放行
  let token: string | undefined
  if (useAuth.getState().status !== 'authed') {
    const key = await turnstileSiteKey()
    if (!key) return { move: local(), engine: 'local' }
    token = (await getTurnstileToken(key, game)) ?? undefined
    if (!token) return { move: local(), engine: 'local' }
  }

  let res: AiMoveResponse
  try {
    res = await aiApi.move(game, level, legal.map((e) => e.text), side, deviceId(), token)
  } catch {
    return { move: local(), engine: 'local' }
  }

  // 用本地算好的走法对象回填，避免重新解析丢失易位/吃过路兵/升变标记
  const byText = new Map(legal.map((e) => [e.text, e.move]))
  const pool = res.candidates
    .map((t) => byText.get(t))
    .filter((v): v is T => v !== undefined)

  if (pool.length === 0) return { move: local(), engine: 'local' }

  const move = search(pool)
  return move ? { move, engine: 'cf' } : { move: local(), engine: 'local' }
}
