import { useCallback, useSyncExternalStore } from 'react'

/**
 * 游客/未登录时的最高分本地兜底，键为 gameId。
 *
 * 注意：useSyncExternalStore 的 getSnapshot 必须返回稳定引用，
 * 否则 React 会判定 "getSnapshot should be cached" 并陷入无限循环。
 * 因此这里把解析结果缓存在模块级 snapshot 中，只在真正变化时替换引用。
 */

const STORAGE_KEY = 'gamehub.localBest.v1'
const EMPTY: BestMap = {}

export type BestMap = Record<string, number>

const listeners = new Set<() => void>()

let snapshot: BestMap = EMPTY
let loaded = false

function emit() {
  listeners.forEach((l) => l())
}

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    snapshot = raw ? (JSON.parse(raw) as BestMap) : EMPTY
  } catch {
    snapshot = EMPTY
  }
}

function persist(map: BestMap) {
  snapshot = map
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* 隐私模式等场景下写入失败，内存内仍然生效 */
  }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // 跨标签页同步
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage)
    }
  }
}

function handleStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== STORAGE_KEY) return
  loaded = false
  load()
  emit()
}

/** 读取全部本地最高分（稳定引用，可安全用于 useSyncExternalStore） */
export function getAllLocalBests(): BestMap {
  load()
  return snapshot
}

/** 读取某游戏本地最高分 */
export function getLocalBest(gameId: string): number {
  load()
  return snapshot[gameId] ?? 0
}

/** 提交分数到本地，返回是否刷新纪录 */
export function saveLocalBest(gameId: string, score: number): boolean {
  load()
  const prev = snapshot[gameId] ?? 0
  if (score <= prev) return false
  persist({ ...snapshot, [gameId]: score })
  return true
}

/** 响应式读取某游戏本地最高分 */
export function useLocalBest(gameId: string): number {
  return useSyncExternalStore(
    subscribe,
    () => getLocalBest(gameId),
    () => 0,
  )
}

/** 响应式读取全部本地最高分 */
export function useLocalBests(): BestMap {
  return useSyncExternalStore(subscribe, getAllLocalBests, () => EMPTY)
}

/** 清空本地纪录 */
export function useClearLocalBests(): () => void {
  return useCallback(() => persist({}), [])
}
