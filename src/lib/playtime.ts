import { useEffect, useRef } from 'react'

/** 每隔这么久把累计的秒数上报一次 */
const FLUSH_INTERVAL = 30_000
/** 超过这么久没有任何按键/点击就当作离开了，暂停累计 */
const IDLE_AFTER = 5 * 60_000
/** 单日上限，和后端校验保持一致 */
const MAX_DAY_SECONDS = 86_400

const PENDING_PREFIX = 'gamehub.playtime.pending.'

/** 上次没能上报的秒数。存下来是为了关标签页时不丢数据 */
function readPending(gameId: string): number {
  try {
    const raw = localStorage.getItem(PENDING_PREFIX + gameId)
    const n = raw === null ? 0 : Number(raw)
    return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_DAY_SECONDS * 30) : 0
  } catch {
    return 0
  }
}

function writePending(gameId: string, seconds: number): void {
  try {
    if (seconds <= 0) localStorage.removeItem(PENDING_PREFIX + gameId)
    else localStorage.setItem(PENDING_PREFIX + gameId, String(Math.floor(seconds)))
  } catch {
    // 配额满或隐私模式下放弃持久化，内存里仍会继续累计
  }
}

/**
 * 记录当前页面的游玩时长。
 *
 * 语义：游戏页挂载且标签页可见时累计；切到后台或离开超过 5 分钟暂停；
 * 每 30 秒上报一次增量。日期由服务端生成，客户端不传时间。
 *
 * 用 sendBeacon 而不是 fetch：关标签页时 fetch 会被中断，beacon 由浏览器接管送达。
 * Blob 的 type 决定请求的 Content-Type，给成 application/json 后端 request.json() 才能解析。
 */
export function usePlayTime(gameId: string, enabled: boolean): void {
  const pendingRef = useRef(0)
  /** 当前这段连续计时的起点；null 表示当前没有在计时 */
  const sinceRef = useRef<number | null>(null)
  const idleRef = useRef(false)

  useEffect(() => {
    if (!enabled || !gameId) return

    pendingRef.current = readPending(gameId)

    const persist = () => writePending(gameId, pendingRef.current)

    /** 把当前这段连续计时结算进待上报总量 */
    const settle = () => {
      if (sinceRef.current === null) return
      pendingRef.current += Math.round((Date.now() - sinceRef.current) / 1000)
      sinceRef.current = null
    }

    const markActive = () => {
      if (idleRef.current) {
        idleRef.current = false
        sinceRef.current = Date.now()
      }
    }

    const flush = () => {
      settle()
      persist()
      const seconds = Math.floor(pendingRef.current)
      if (seconds <= 0 || !navigator.onLine) return
      pendingRef.current -= seconds
      persist()
      const payload = new Blob([JSON.stringify({ gameId, seconds })], {
        type: 'application/json',
      })
      navigator.sendBeacon('/api/playtime', payload)
    }

    const onActivity = () => markActive()

    const timer = window.setInterval(() => {
      if (document.hidden) {
        settle()
        persist()
        return
      }
      // 长时间没操作就结算这段，之后不再累计，直到有操作
      if (sinceRef.current !== null && Date.now() - sinceRef.current > IDLE_AFTER) {
        settle()
        idleRef.current = true
      }
      flush()
    }, FLUSH_INTERVAL)

    const onVisibility = () => {
      if (document.hidden) flush()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    window.addEventListener('pointerdown', onActivity, true)
    window.addEventListener('keydown', onActivity, true)

    markActive()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('pointerdown', onActivity, true)
      window.removeEventListener('keydown', onActivity, true)
      window.clearInterval(timer)
      flush()
    }
  }, [gameId, enabled])
}
