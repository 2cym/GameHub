import { Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Leaderboard } from '../components/Leaderboard'
import { getGame } from '../games/registry'
import { api } from '../lib/api'
import { getLocalBest, saveLocalBest, useLocalBest } from '../lib/localBest'
import type { LeaderEntry } from '../lib/types'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './GamePage.module.css'

export function GamePage() {
  const { gameId } = useParams()
  const meta = getGame(gameId)
  const { user, status, favorites, toggleFavorite } = useAuth()
  const localBest = useLocalBest(meta?.id ?? '')

  const [cloudBest, setCloudBest] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([])
  const [lbLoading, setLbLoading] = useState(true)
  const [favBusy, setFavBusy] = useState(false)

  const loadLeaderboard = useCallback(() => {
    if (!meta) return
    setLbLoading(true)
    api
      .leaderboard(meta.id)
      .then(({ entries }) => setLeaderboard(entries))
      .catch(() => setLeaderboard([]))
      .finally(() => setLbLoading(false))
  }, [meta])

  useEffect(() => {
    if (!meta) return
    loadLeaderboard()
    setCloudBest(0)
    if (status === 'authed') {
      api
        .myBests()
        .then(({ bests }) => {
          const mine = bests.find((b) => b.gameId === meta.id)
          if (mine) setCloudBest(mine.best)
        })
        .catch(() => {})
    }
  }, [meta, status, loadLeaderboard])

  const handleGameOver = useCallback(
    async (score: number) => {
      if (!meta) return
      const isNewLocal = saveLocalBest(meta.id, score)

      if (status === 'authed') {
        try {
          const { best } = await api.submitScore(meta.id, score)
          setCloudBest((prev) => Math.max(prev, best))
          if (score > 0 && score >= best) {
            toast(`提交成功，${score >= best ? '可能刷新了纪录！' : '已记入排行榜'}`, 'success')
          }
          loadLeaderboard()
        } catch {
          if (isNewLocal) toast(`本局 ${score} 分已保存到本地`, 'info')
          toast('成绩上传失败，已保留本地纪录', 'error')
        }
      } else if (isNewLocal) {
        toast(`新纪录 ${score} 分！登录后可上榜`, 'info')
      }
    },
    [meta, status, loadLeaderboard],
  )

  const handleFav = async () => {
    if (!meta || favBusy) return
    setFavBusy(true)
    try {
      await toggleFavorite(meta.id)
    } catch {
      toast('收藏操作失败，请重试', 'error')
    } finally {
      setFavBusy(false)
    }
  }

  if (!meta) {
    return (
      <main className={`container ${styles.missing}`}>
        <h1>🛸 游戏不存在</h1>
        <p>这个链接可能已失效，回到首页看看其他游戏吧。</p>
        <Link to="/" className="btn btn-primary">
          返回首页
        </Link>
      </main>
    )
  }

  const Game = meta.Component
  const isFav = favorites.includes(meta.id)
  const myBest = Math.max(localBest, cloudBest)
  const localRecord = getLocalBest(meta.id)

  return (
    <main className={`container ${styles.page}`}>
      <div className={styles.crumbs}>
        <Link to="/">首页</Link>
        <span>/</span>
        <span>{meta.name}</span>
      </div>

      <div className={styles.layout}>
        <section className={styles.gameArea}>
          <div className={styles.gameHeader}>
            <h1 className={styles.gameTitle}>
              <span className={styles.gameEmoji}>{meta.emoji}</span>
              {meta.name}
            </h1>
            <button
              type="button"
              className={`btn ${isFav ? 'btn-primary' : ''}`}
              onClick={handleFav}
              disabled={favBusy}
            >
              {isFav ? '★ 已收藏' : '☆ 收藏'}
            </button>
          </div>

          <Suspense fallback={<div className={styles.loading}>加载中…</div>}>
            <Game onGameOver={handleGameOver} />
          </Suspense>
        </section>

        <aside className={styles.panel}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>📖 玩法说明</h2>
            <p className={styles.howTo}>{meta.howToPlay}</p>
            <ul className={styles.controls}>
              {meta.controls.map((c) => (
                <li key={c.keys}>
                  <kbd>{c.keys}</kbd>
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>📊 我的成绩</h2>
            {status === 'authed' ? (
              <p className={styles.myBest}>
                个人最高 <strong>{myBest.toLocaleString()}</strong>
                <span className={styles.bestSrc}>
                  {cloudBest >= localRecord ? '（云端）' : '（本地未上传）'}
                </span>
              </p>
            ) : (
              <p className={styles.myBest}>
                本机最高 <strong>{localBest.toLocaleString()}</strong>
              </p>
            )}
            {status !== 'authed' && (
              <p className={styles.loginTip}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => useAuth.getState().openAuth('login')}
                >
                  登录
                </button>
                后成绩可上榜并云同步
              </p>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>🏆 全球排行榜</h2>
            <Leaderboard
              entries={leaderboard}
              loading={lbLoading}
              meUsername={user?.username}
            />
          </section>
        </aside>
      </div>
    </main>
  )
}
