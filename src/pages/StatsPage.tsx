import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, fmtDuration } from '../components/charts/BarChart'
import { TrendChart } from '../components/charts/TrendChart'
import { getGame } from '../games/registry'
import { api, type MeStats } from '../lib/api'
import { useAuth } from '../stores/auth'
import styles from './Stats.module.css'

export function StatsPage() {
  const { status, user, openAuth } = useAuth()
  const [stats, setStats] = useState<MeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [gameId, setGameId] = useState('')

  const reload = () => {
    if (status !== 'authed') return
    setLoading(true)
    api
      .myStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (status !== 'authed') {
      setStats(null)
      setLoading(false)
      return
    }
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // 没有记录的日期也要显示在柱状图里（显示为 0 高度），所以这里补齐整个窗口
  const timeByGame = useMemo(() => {
    const map = new Map<string, number>()
    for (const day of stats?.dailySeconds ?? []) {
      for (const [id, seconds] of Object.entries(day.byGame)) {
        map.set(id, (map.get(id) ?? 0) + seconds)
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [stats])

  const progressGames = useMemo(() => stats?.progress ?? [], [stats])
  const activeGame = useMemo(() => {
    if (progressGames.length === 0) return null
    const found = progressGames.find((g) => g.gameId === gameId)
    return found ?? progressGames[0]
  }, [progressGames, gameId])

  const maxGameSeconds = timeByGame.length > 0 ? timeByGame[0][1] : 0
  const recordCount = progressGames.reduce((sum, g) => sum + g.points.length, 0)

  if (status !== 'authed') {
    return (
      <main className={`container ${styles.page}`}>
        <section className={styles.emptyCard}>
          <h1>📊 还没有登录</h1>
          <p>登录后可以看到你的成绩进步曲线和游玩时长统计。</p>
          <button type="button" className="btn btn-primary" onClick={() => openAuth('login')}>
            立即登录
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className={`container ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>📊 我的数据</h1>
          <p className={styles.subtitle}>
            {user?.username} · 时长统计自 {stats?.windowStart ?? '—'} 起
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <section className={styles.statRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{fmtDuration(stats?.totalSeconds ?? 0)}</div>
          <div className={styles.statLabel}>总游玩时长</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.playDays ?? 0}</div>
          <div className={styles.statLabel}>活跃天数</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.playedGames ?? 0}</div>
          <div className={styles.statLabel}>玩过的游戏</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{recordCount}</div>
          <div className={styles.statLabel}>破纪录次数</div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>📈 成绩进步曲线</h2>
        {progressGames.length === 0 ? (
          <p className={styles.muted}>
            还没有成绩记录。打完一局破一次纪录，曲线就会长出来——
            <Link to="/">去玩一局</Link>
          </p>
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label="选择游戏">
              {progressGames.map((g) => {
                const meta = getGame(g.gameId)
                const active = activeGame?.gameId === g.gameId
                return (
                  <button
                    key={g.gameId}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${styles.tab} ${active ? styles.tabOn : ''}`}
                    onClick={() => setGameId(g.gameId)}
                  >
                    {meta ? `${meta.emoji} ${meta.name}` : g.gameId}
                  </button>
                )
              })}
            </div>
            {activeGame && (
              <div className={styles.chartBox}>
                <TrendChart points={activeGame.points} />
                <p className={styles.chartNote}>
                  只记录破纪录的成绩，共 {activeGame.points.length} 次刷新，
                  最新 {activeGame.points[activeGame.points.length - 1]?.score.toLocaleString()} 分。
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>⏱️ 每日游玩时长（近 30 天）</h2>
        {stats && stats.dailySeconds.length > 0 ? (
          <div className={styles.chartBox}>
            <BarChart days={stats.dailySeconds} windowStart={stats.windowStart} today={stats.today} />
            <p className={styles.chartNote}>
              单位：秒。后台时长不计入——切到别的标签页或离开 5 分钟以上会暂停累计。
            </p>
          </div>
        ) : (
          <p className={styles.muted}>
            还没有时长记录。打开一个游戏玩一会儿就会开始统计。
          </p>
        )}
      </section>

      {timeByGame.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>🎮 各游戏时长占比</h2>
          <div className={styles.breakdown}>
            {timeByGame.map(([id, seconds]) => {
              const meta = getGame(id)
              return (
                <div key={id} className={styles.breakdownRow}>
                  <Link to={`/game/${encodeURIComponent(id)}`} className={styles.breakdownName}>
                    <span>{meta?.emoji ?? '🎮'}</span>
                    <span>{meta?.name ?? id}</span>
                  </Link>
                  <div className={styles.breakdownBarWrap}>
                    <div
                      className={styles.breakdownBar}
                      style={{ width: `${(seconds / maxGameSeconds) * 100}%` }}
                    />
                  </div>
                  <span className={styles.breakdownValue}>{fmtDuration(seconds)}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}
