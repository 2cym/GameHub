import type { LeaderEntry } from '../lib/types'
import styles from './Leaderboard.module.css'

const MEDALS = ['🥇', '🥈', '🥉']

interface LeaderboardProps {
  entries: LeaderEntry[]
  loading: boolean
  meUsername?: string
}

export function Leaderboard({ entries, loading, meUsername }: LeaderboardProps) {
  if (loading) {
    return <p className={styles.empty}>排行榜加载中…</p>
  }
  if (entries.length === 0) {
    return <p className={styles.empty}>还没有人上榜，虚位以待 🏆</p>
  }

  return (
    <ol className={styles.list}>
      {entries.map((e, i) => (
        <li
          key={`${e.username}-${i}`}
          className={`${styles.row} ${
            e.username === meUsername ? styles.me : ''
          }`}
        >
          <span className={`${styles.rank} ${i < 3 ? styles.medal : ''}`}>
            {i < 3 ? MEDALS[i] : i + 1}
          </span>
          <span className={styles.name}>{e.username}</span>
          <span className={styles.score}>{e.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  )
}
