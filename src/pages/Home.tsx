import { useEffect, useMemo, useState } from 'react'
import { GameCard } from '../components/GameCard'
import { CATEGORIES, GAMES } from '../games/registry'
import { api } from '../lib/api'
import { useLocalBests } from '../lib/localBest'
import { useAuth } from '../stores/auth'
import styles from './Home.module.css'

export function HomePage() {
  const { user, status } = useAuth()
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('全部')
  const [cloudBests, setCloudBests] = useState<Record<string, number>>({})
  const localBests = useLocalBests()

  useEffect(() => {
    setCloudBests({})
    if (status !== 'authed') return
    api
      .myBests()
      .then(({ bests }) => {
        const map: Record<string, number> = {}
        for (const b of bests) map[b.gameId] = b.best
        setCloudBests(map)
      })
      .catch(() => {})
  }, [status])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return GAMES.filter((g) => {
      if (category !== '全部' && g.category !== category) return false
      if (kw && !`${g.name}${g.id}${g.description}`.toLowerCase().includes(kw))
        return false
      return true
    })
  }, [keyword, category])

  return (
    <main className="container">
      <section className={styles.hero}>
        <h1 className={styles.title}>
          一个页面，<span className={styles.grad}>{GAMES.length} 款经典</span>
          <br />
          即点即玩的小游戏集合
        </h1>
        <p className={styles.sub}>
          全部游戏由前端精心打造，无需下载、即开即玩。
          登录后可参与全球排行榜，让最高分替你说话。
        </p>
        <div className={styles.heroStats}>
          <span className="chip">🎯 {GAMES.length} 款游戏</span>
          <span className="chip chip-cyan">🏆 全球排行榜</span>
          <span className="chip chip-gold">☁️ 成绩云端同步</span>
        </div>
      </section>

      <section className={styles.toolbar}>
        <input
          className={`input ${styles.search}`}
          type="search"
          placeholder="搜索游戏名称或关键词…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className={styles.cats}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.cat} ${category === c ? styles.catOn : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.grid}>
        {filtered.map((g, i) => (
          <GameCard
            key={g.id}
            game={g}
            index={i}
            best={Math.max(localBests[g.id] ?? 0, cloudBests[g.id] ?? 0)}
          />
        ))}
        {filtered.length === 0 && (
          <p className={styles.empty}>
            没有找到匹配「{keyword}」的游戏，换个关键词试试？
          </p>
        )}
      </section>

      {!user && (
        <p className={styles.loginHint}>
          💡 游客成绩保存在本机，登录后可上传排行榜并云同步
        </p>
      )}
    </main>
  )
}
