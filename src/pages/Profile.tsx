import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GAMES } from '../games/registry'
import { api } from '../lib/api'
import { useLocalBests } from '../lib/localBest'
import type { PersonalBest, ScoreRecord } from '../lib/types'
import { useAuth } from '../stores/auth'
import styles from './Profile.module.css'

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProfilePage() {
  const { user, status, favorites, openAuth } = useAuth()
  const localBests = useLocalBests()
  const [cloudBests, setCloudBests] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<ScoreRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (status !== 'authed') {
      setLoaded(false)
      return
    }
    Promise.all([api.myBests(), api.myRecent()])
      .then(([{ bests }, { records }]) => {
        const map: Record<string, number> = {}
        for (const b of bests as PersonalBest[]) map[b.gameId] = b.best
        setCloudBests(map)
        setRecent(records)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [status])

  if (status === 'loading') {
    return <main className={`container ${styles.page}`}>加载中…</main>
  }

  if (!user) {
    return (
      <main className={`container ${styles.page} ${styles.guest}`}>
        <h1>👋 还没有登录</h1>
        <p>登录后可以查看你的最高分、收藏和游玩记录，还能登上全球排行榜。</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openAuth('login')}
        >
          立即登录
        </button>
      </main>
    )
  }

  const favGames = GAMES.filter((g) => favorites.includes(g.id))

  return (
    <main className={`container ${styles.page}`}>
      <section className={styles.userCard}>
        <span className={styles.bigAvatar}>
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className={styles.username}>{user.username}</h1>
          <p className={styles.email}>{user.email}</p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>🏅 游戏最佳纪录</h2>
        <div className={styles.bestsGrid}>
          {GAMES.map((g) => {
            const best = Math.max(cloudBests[g.id] ?? 0, localBests[g.id] ?? 0)
            return (
              <Link key={g.id} to={`/game/${g.id}`} className={styles.bestCard}>
                <span className={styles.bestEmoji}>{g.emoji}</span>
                <span className={styles.bestName}>{g.name}</span>
                <span className={styles.bestScore}>
                  {best > 0 ? best.toLocaleString() : '—'}
                </span>
                <span className={styles.bestLabel}>
                  {best > 0 ? '最高分' : '暂无纪录'}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {favGames.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>⭐ 我的收藏</h2>
          <div className={styles.favs}>
            {favGames.map((g) => (
              <Link key={g.id} to={`/game/${g.id}`} className={styles.favChip}>
                {g.emoji} {g.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>🕑 最近成绩</h2>
        {loaded && recent.length === 0 ? (
          <p className={styles.emptyLine}>
            还没有云端成绩记录，去打一局吧！
          </p>
        ) : (
          <ul className={styles.recentList}>
            {recent.map((r, i) => {
              const game = GAMES.find((g) => g.id === r.gameId)
              return (
                <li key={i} className={styles.recentRow}>
                  <span>
                    {game ? `${game.emoji} ${game.name}` : r.gameId}
                  </span>
                  <span className={styles.recentScore}>
                    {r.score.toLocaleString()}
                  </span>
                  <span className={styles.recentTime}>
                    {formatTime(r.createdAt)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {recent.length === 0 && !loaded && (
          <p className={styles.emptyLine}>加载中…</p>
        )}
      </section>
    </main>
  )
}
