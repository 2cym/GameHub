import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { GAMES } from '../games/registry'
import { api, FAVORITE_CATEGORIES, type FavoriteCategory } from '../lib/api'
import { AVATAR_EMOJIS, AVATAR_PALETTES, paletteIndex } from '../lib/avatar'
import { useLocalBests } from '../lib/localBest'
import type { PersonalBest, ScoreRecord } from '../lib/types'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './Profile.module.css'

const FAV_CATEGORY_ICON: Record<FavoriteCategory, string> = {
  常玩: '🔥',
  挑战: '🏆',
  休闲: '🍃',
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProfilePage() {
  const { user, status, favorites, favoriteCategory, updateAvatar, openAuth } = useAuth()
  const localBests = useLocalBests()
  const [cloudBests, setCloudBests] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<ScoreRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftEmoji, setDraftEmoji] = useState('')
  const [draftColor, setDraftColor] = useState(0)
  const [savingAvatar, setSavingAvatar] = useState(false)

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

  const favGames = GAMES.filter((g) => g.id in favorites)

  const openPicker = () => {
    setDraftEmoji(user.avatarEmoji ?? '')
    setDraftColor(paletteIndex(user.avatarColor))
    setPickerOpen(true)
  }

  const saveAvatar = async () => {
    if (savingAvatar) return
    setSavingAvatar(true)
    try {
      await updateAvatar({ avatarEmoji: draftEmoji, avatarColor: draftColor })
      setPickerOpen(false)
      toast('头像已更新', 'success')
    } catch {
      toast('头像更新失败，请重试', 'error')
    } finally {
      setSavingAvatar(false)
    }
  }

  return (
    <main className={`container ${styles.page}`}>
      <section className={styles.userCard}>
        <Avatar
          className={styles.bigAvatar}
          emoji={user.avatarEmoji}
          color={user.avatarColor}
          fallback={user.username}
          size={64}
        />
        <div className={styles.userMeta}>
          <h1 className={styles.username}>{user.username}</h1>
          <p className={styles.email}>{user.email}</p>
          <button type="button" className="btn btn-ghost" onClick={openPicker}>
            更换头像
          </button>
        </div>
        {pickerOpen && (
          <div className={styles.picker}>
            <div className={styles.pickerBody}>
              <div className={styles.pickerPreview}>
                <Avatar
                  emoji={draftEmoji}
                  color={draftColor}
                  fallback={user.username}
                  size={64}
                />
              </div>
              <div className={styles.emojiGrid} role="group" aria-label="选择头像表情">
                <button
                  type="button"
                  className={`${styles.emojiOpt} ${draftEmoji === '' ? styles.emojiOn : ''}`}
                  aria-pressed={draftEmoji === ''}
                  onClick={() => setDraftEmoji('')}
                >
                  字母
                </button>
                {AVATAR_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`${styles.emojiOpt} ${draftEmoji === e ? styles.emojiOn : ''}`}
                    aria-pressed={draftEmoji === e}
                    onClick={() => setDraftEmoji(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.paletteRow} role="group" aria-label="选择头像配色">
              {AVATAR_PALETTES.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.swatch} ${draftColor === i ? styles.swatchOn : ''}`}
                  style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                  aria-label={`第 ${i + 1} 种配色`}
                  aria-pressed={draftColor === i}
                  onClick={() => setDraftColor(i)}
                />
              ))}
            </div>
            <div className={styles.pickerActions}>
              <button type="button" className="btn btn-ghost" onClick={() => setPickerOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" disabled={savingAvatar} onClick={saveAvatar}>
                {savingAvatar ? '保存中…' : '保存头像'}
              </button>
            </div>
          </div>
        )}
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
          {FAVORITE_CATEGORIES.map((cat) => {
            const list = favGames.filter((g) => favoriteCategory(g.id) === cat)
            if (list.length === 0) return null
            return (
              <div key={cat} className={styles.favGroup}>
                <span className={styles.favGroupLabel}>
                  {FAV_CATEGORY_ICON[cat]} {cat}
                  <span className={styles.favGroupCount}>{list.length}</span>
                </span>
                <div className={styles.favs}>
                  {list.map((g) => (
                    <Link key={g.id} to={`/game/${g.id}`} className={styles.favChip}>
                      {g.emoji} {g.name}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
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
