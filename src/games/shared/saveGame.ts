import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameStatus } from '../../lib/types'

/**
 * 存档续玩：每个游戏一条存档，存在 localStorage，断网也可用。
 *
 * 游戏只负责「怎么把状态拍成快照」和「怎么把快照灌回状态」，
 * 定时、过期、清理、卸载落盘这些杂活都在 useSaveGame 里。
 */

const SAVE_KEY = (game: string) => `gamehub.save.${game}`
/** 超过 7 天的存档不再提示续玩，避免拿很久以前的残局开局 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** 游戏进行中每隔多久落盘一次，防止浏览器崩溃丢进度 */
const SAVE_EVERY_MS = 15_000

export interface SaveShape<T = unknown> {
  game: string
  /** 只可能是 running / paused；'over' 时直接清档 */
  status: 'running' | 'paused'
  snapshot: T
  score: number
  savedAt: number
}

const QUOTA_EXCEEDED = [
  'QuotaExceededError',
  'NS_ERROR_DOM_QUOTA_REACHED',
  ' exceeded the quota',
]

/** 落盘失败的统一处理：配额满时删掉老存档腾空间，而不是让整个功能静默失效 */
function persist(key: string, data: SaveShape): boolean {
  const body = JSON.stringify(data)
  try {
    localStorage.setItem(key, body)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    const isQuota = QUOTA_EXCEEDED.some((s) => msg.includes(s)) || err instanceof DOMException
    if (!isQuota) return false
    // 配额满：先删掉其它游戏的存档再试一次
    for (const other of otherSaveKeys()) {
      try {
        localStorage.removeItem(other)
      } catch {
        break
      }
    }
    try {
      localStorage.setItem(key, body)
      return true
    } catch {
      return false
    }
  }
}

function otherSaveKeys(): string[] {
  const out: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('gamehub.save.')) out.push(k)
  }
  return out
}

function readAll(): Record<string, SaveShape | null> {
  const out: Record<string, SaveShape | null> = {}
  for (const key of otherSaveKeys()) {
    try {
      const raw = localStorage.getItem(key)
      out[key] = raw === null ? null : (JSON.parse(raw) as SaveShape)
    } catch {
      out[key] = null
    }
  }
  return out
}

/** 清掉所有过期的存档，腾出空间也避免提示续玩已失效的残局 */
export function pruneStaleSaves(): number {
  let removed = 0
  const now = Date.now()
  for (const [key, save] of Object.entries(readAll())) {
    const stale = !save || typeof save.savedAt !== 'number' || now - save.savedAt > MAX_AGE_MS
    if (stale) {
      localStorage.removeItem(key)
      removed++
    }
  }
  return removed
}

export function loadSave<T = unknown>(game: string): SaveShape<T> | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY(game))
    if (raw === null) return null
    const save = JSON.parse(raw) as SaveShape<T>
    if (!save || typeof save !== 'object') return null
    if (save.game !== game) return null
    if (typeof save.savedAt !== 'number' || Date.now() - save.savedAt > MAX_AGE_MS) return null
    if (save.status !== 'running' && save.status !== 'paused') return null
    if (save.snapshot === null || typeof save.snapshot !== 'object') return null
    return save
  } catch {
    return null
  }
}

export function writeSave<T>(game: string, snapshot: T, status: 'running' | 'paused', score: number): void {
  // JSON.stringify 前过一遍清洗：Set 转数组、丢弃 undefined / 函数 / DOM 节点 / 循环引用
  const clean = stripUnserializable(snapshot)
  persist(SAVE_KEY(game), { game, status, snapshot: clean, score, savedAt: Date.now() })
}

export function clearSave(game: string): void {
  try {
    localStorage.removeItem(SAVE_KEY(game))
  } catch {
    // 读不了也删不了，不影响游戏本身
  }
}

/** 深拷贝并剔除 JSON 无法表达的值，避免 stringify 抛错或存下 null 洞 */
export function stripUnserializable(value: unknown): unknown {
  const seen = new WeakSet<object>()

  const walk = (v: unknown): unknown => {
    if (v === null) return null
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    if (typeof v !== 'object') return v

    const obj = v as object
    if (seen.has(obj)) return null
    seen.add(obj)

    let out: unknown
    if (obj instanceof Set) out = Array.from(obj).map((item) => walk(item))
    else if (Array.isArray(obj)) out = obj.map((item) => walk(item))
    else {
      // DOM 节点、Canvas 上下文等运行时对象带不进快照
      if (typeof Element !== 'undefined' && obj instanceof Element) return null
      const record: Record<string, unknown> = {}
      for (const [k, item] of Object.entries(obj)) {
        const cleaned = walk(item)
        if (cleaned !== null) record[k] = cleaned
      }
      out = record
    }

    seen.delete(obj)
    return out
  }

  return walk(value)
}

/**
 * 单个游戏的存档钩子。
 *
 * serialize 返回 null 表示「此刻不该存」（例如棋盘还没初始化）。
 * resume 成功返回 true，失败（无存档/已过期）返回 false。
 */
export function useSaveGame<T = unknown>(
  game: string,
  status: GameStatus,
  serialize: () => T | null,
  restore: (snapshot: T) => void,
  getScore: () => number,
): { hasSave: boolean; resume: () => boolean; reset: () => void } {
  const [hasSave, setHasSave] = useState(() => loadSave(game) !== null)

  const statusRef = useRef(status)
  statusRef.current = status
  const serializeRef = useRef(serialize)
  serializeRef.current = serialize
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  const scoreRef = useRef(getScore)
  scoreRef.current = getScore

  const save = useCallback(() => {
    const s = statusRef.current
    if (s === 'idle' || s === 'over') return
    const data = serializeRef.current()
    if (data === null || data === undefined) return
    writeSave(game, data, s, scoreRef.current())
    setHasSave(true)
  }, [game])

  // 重新开始要立刻清掉旧档，否则下一次刷新会弹出上一局的残局
  const reset = useCallback(() => {
    clearSave(game)
    setHasSave(false)
  }, [game])

  // 一局结束就清档：结束后的空棋盘不该被当成可续玩的残局
  useEffect(() => {
    if (status === 'over') {
      clearSave(game)
      setHasSave(false)
    }
  }, [status, game])

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) save()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', save)
    const timer = window.setInterval(() => {
      if (!document.hidden) save()
    }, SAVE_EVERY_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', save)
      window.clearInterval(timer)
      save()
    }
  }, [save])

  const resume = useCallback(() => {
    const saved = loadSave<T>(game)
    if (!saved) return false
    restoreRef.current(saved.snapshot)
    clearSave(game)
    setHasSave(false)
    return true
  }, [game])

  return { hasSave, resume, reset }
}
