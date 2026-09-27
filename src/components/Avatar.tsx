import { avatarGradient } from '../lib/avatar'
import styles from './Avatar.module.css'

interface AvatarProps {
  emoji?: string
  color?: number | string
  /** 没有 emoji 时的兜底文字，传用户名即可自动取首字母 */
  fallback?: string
  size?: number
  /** 叠加在基础样式之上，用于额外阴影、边距等 */
  className?: string
}

/** 头像：有 emoji 用 emoji，没有就回落到首字母。
 *  纯装饰元素，调用点旁边都跟着可见的名字文本，所以标记 aria-hidden。 */
export function Avatar({ emoji, color, fallback, size = 30, className }: AvatarProps) {
  const mark = emoji?.trim() || fallback?.trim()?.slice(0, 1).toUpperCase() || '?'
  const isEmoji = !!emoji?.trim()
  return (
    <span
      className={[styles.avatar, className].filter(Boolean).join(' ')}
      style={{
        background: avatarGradient(color),
        width: size,
        height: size,
        fontSize: isEmoji ? Math.round(size * 0.6) : Math.round(size * 0.44),
      }}
      aria-hidden="true"
    >
      {mark}
    </span>
  )
}
