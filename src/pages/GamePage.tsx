import { Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Leaderboard } from '../components/Leaderboard'
import { ScoreShareCard } from '../components/ScoreShareCard'
import { getGame } from '../games/registry'
import { api, FAVORITE_CATEGORIES, type FavoriteCategory } from '../lib/api'
import { getLocalBest, saveLocalBest, useLocalBest } from '../lib/localBest'
import { usePlayTime } from '../lib/playtime'
import type { ShareCardOpts } from '../lib/shareCard'
import type { LeaderEntry } from '../lib/types'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './GamePage.module.css'

/** 挑战目标分的合法范围：拦住 NaN、负数、以及有人塞进来的超大值 */
const MAX_CHALLENGE = 10_000_000
const challengeKey = (gameId: string) => `gamehub.challenge.${gameId}`

function readChallenge(gameId: string): number | null {
  try {
    const raw = localStorage.getItem(challengeKey(gameId))
    const n = raw === null ? NaN : Number(raw)
    return Number.isInteger(n) && n >= 0 && n <= MAX_CHALLENGE ? n : null
  } catch {
    return null
  }
}

function normalizeTarget(value: string | null): number | null {
  if (value === null) return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= MAX_CHALLENGE ? n : null
}

/** 用 BASE_URL 拼，站点挂到子路径时链接才有效 */
function challengeUrl(gameId: string, score: number): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '')
  const target = Math.max(1, Math.round(score))
  return `${window.location.origin}${base}/challenge/${encodeURIComponent(gameId)}?t=${target}`
}

export function GamePage() {
  const { gameId } = useParams()
  const meta = getGame(gameId)
  const { user, status, isFavorite, favoriteCategory, setFavoriteCategory, toggleFavorite } =
    useAuth()
  const localBest = useLocalBest(meta?.id ?? '')
  const [searchParams] = useSearchParams()

  // 只在登录时上报（后端 requireAuth）；游客的游玩时长不追踪
  usePlayTime(meta?.id ?? '', status === 'authed')

  const [cloudBest, setCloudBest] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([])
  const [lbLoading, setLbLoading] = useState(true)
  const [favBusy, setFavBusy] = useState(false)
  const [shareCard, setShareCard] = useState<ShareCardOpts | null>(null)
  /** 挑战目标分：朋友发来的链接，或之前保存过的挑战 */
  const [challenge, setChallenge] = useState<number | null>(null)

  // 链接里的 t 优先，顺手存下来，下次直接进这个游戏的页面还在
  useEffect(() => {
    if (!gameId) return
    const fromUrl = normalizeTarget(searchParams.get('t'))
    if (fromUrl !== null) {
      try {
        localStorage.setItem(challengeKey(gameId), String(fromUrl))
      } catch {
        // 存储不可用（隐私模式等）时照样能玩，只是不记住挑战
      }
      setChallenge(fromUrl)
    } else {
      setChallenge(readChallenge(gameId))
    }
    setShareCard(null)
  }, [gameId, searchParams])

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

      // 挑战结算：超过就清掉本地挑战，让横幅消失
      if (challenge !== null) {
        if (score > challenge) {
          toast(`🏆 挑战成功！超过了 ${challenge.toLocaleString()} 分`, 'success')
          try {
            localStorage.removeItem(challengeKey(meta.id))
          } catch {
            // 同上，存不了不影响
          }
          setChallenge(null)
        } else {
          toast(`还差 ${(challenge - score).toLocaleString()} 分就能超过挑战目标`, 'info')
        }
      }

      // 零分不值得分享；卡片里能一键保存图片 / 复制 / 发起挑战
      if (score > 0) {
        setShareCard({
          gameEmoji: meta.emoji,
          gameName: meta.name,
          score,
          username: user?.username ?? '游客',
          best: Math.max(localBest, cloudBest),
          challengeUrl: challengeUrl(meta.id, score),
        })
      }
    },
    [meta, status, loadLeaderboard, challenge, user, localBest, cloudBest],
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
  const isFav = isFavorite(meta.id)
  const favCategory = favoriteCategory(meta.id)
  const myBest = Math.max(localBest, cloudBest)
  const localRecord = getLocalBest(meta.id)

  return (
    <main className={`container ${styles.page}`}>
      <div className={styles.crumbs}>
        <Link to="/">首页</Link>
        <span>/</span>
        <span>{meta.name}</span>
      </div>

      {challenge !== null && (
        <div className={styles.challengeBanner}>
          <span className={styles.challengeText}>
            🎯 <strong>{challenge.toLocaleString()}</strong> 分挑战进行中，你能超过吗？
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              try {
                localStorage.removeItem(challengeKey(meta.id))
              } catch {
                // 存储不可用时忽略
              }
              setChallenge(null)
            }}
          >
            退出挑战
          </button>
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.gameArea}>
          <div className={styles.gameHeader}>
            <h1 className={styles.gameTitle}>
              <span className={styles.gameEmoji}>{meta.emoji}</span>
              {meta.name}
            </h1>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={`btn ${isFav ? 'btn-primary' : ''}`}
                onClick={handleFav}
                disabled={favBusy}
              >
                {isFav ? '★ 已收藏' : '☆ 收藏'}
              </button>
              {isFav && user && (
                <label className={styles.catLabel}>
                  分类
                  <select
                    value={favCategory}
                    onChange={(e) =>
                      setFavoriteCategory(meta.id, e.target.value as FavoriteCategory).catch(() =>
                        toast('分类更新失败，请重试', 'error'),
                      )
                    }
                  >
                    {FAVORITE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
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

      <ScoreShareCard
        open={shareCard !== null}
        card={shareCard}
        onClose={() => setShareCard(null)}
      />
    </main>
  )
}
