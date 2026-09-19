import { useEffect, useRef } from 'react'

const PREVENT_DEFAULT = new Set([
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  ' ',
])

/**
 * 游戏键盘绑定：window 级 keydown，键名统一小写（空格为 ' '）。
 * 输入框聚焦时自动跳过，避免打断登录等表单操作。
 */
export function useGameKeys(map: Record<string, (e: KeyboardEvent) => void>) {
  const mapRef = useRef(map)
  mapRef.current = map

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      const key = e.key.toLowerCase()
      const fn = mapRef.current[key]
      if (fn) {
        if (PREVENT_DEFAULT.has(key)) e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
