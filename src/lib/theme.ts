import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'gamehub.theme.v1'
/** 同一标签页内多处主题状态同步用；跨标签页靠原生 storage 事件 */
const THEME_CHANGE_EVENT = 'gamehub:theme'
const THEME_COLOR_DARK = '#0b0e1a'
const THEME_COLOR_LIGHT = '#f4f6fb'

/** 系统是否已偏好亮色。matchMedia 不可用时按暗色默认处理，与 :root 的默认一致 */
function systemPrefersLight(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(color-scheme: light)').matches
}

/** 读取用户已存的主题，没有则跟随系统 */
export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // localStorage 不可用（隐私模式配额、被拦截）时静默回落到系统偏好
  }
  return systemPrefersLight() ? 'light' : 'dark'
}

/** 把主题落到 <html> 上。暗色是 :root 默认，所以直接移除属性而不设 'dark' */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'light') root.setAttribute('data-theme', 'light')
  else root.removeAttribute('data-theme')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? THEME_COLOR_LIGHT : THEME_COLOR_DARK)
}

/** 写入并立即生效，同时广播给同页其它订阅者 */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // 存不进去也要让本次切换生效
  }
  applyTheme(theme)
  window.dispatchEvent(new CustomEvent<{ theme: Theme }>(THEME_CHANGE_EVENT, { detail: { theme } }))
}

/** 主题状态与切换动作。多组件各自调用会保持一致 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, set] = useState<Theme>(getTheme)

  useEffect(() => {
    applyTheme(theme)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) set(e.newValue)
    }
    const onLocal = (e: Event) => {
      const next = (e as CustomEvent<{ theme: Theme }>).detail?.theme
      if (next === 'dark' || next === 'light') set(next)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(THEME_CHANGE_EVENT, onLocal)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(THEME_CHANGE_EVENT, onLocal)
    }
  }, [])

  const toggle = useCallback(() => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, toggle }
}
