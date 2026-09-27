import { useEffect, useMemo, useState } from 'react'
import { GameCard } from '../components/GameCard'
import { CATEGORIES, GAMES } from '../games/registry'
import { api, messageApi, type MessageRow } from '../lib/api'
import { useLocalBests } from '../lib/localBest'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './Home.module.css'

export function HomePage() {
  const { user, status } = useAuth()
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('全部')
  const [cloudBests, setCloudBests] = useState<Record<string, number>>({})
  const localBests = useLocalBests()
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [msgName, setMsgName] = useState(user?.username ?? '')
  const [msgContent, setMsgContent] = useState('')
  const [busy, setBusy] = useState(false)

  // Load public messages
  useEffect(() => {
    api.publicMessages(20).then((r) => setMessages(r.messages)).catch(() => {})
  }, [])

  // Sync username when user logs in
  useEffect(() => {
    if (user) setMsgName((prev) => prev || user.username)
  }, [user])

  const submitMessage = async () => {
    const name = msgName.trim()
    const content = msgContent.trim()
    if (!name) { toast('请输入昵称', 'error'); return }
    if (!content) { toast('请输入留言内容', 'error'); return }
    setBusy(true)
    try {
      await messageApi.create(name, content)
      setMsgContent('')
      toast('留言成功！', 'success')
      const r = await api.publicMessages(20)
      setMessages(r.messages)
    } catch (e) {
      toast(e instanceof Error ? e.message : '留言失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  function fmtMsgTime(ts: number): string {
    const diff = Math.floor(Date.now() / 1000) - ts
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
    return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }

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

      <section className={styles.messageBoard}>
        <h2 className={styles.boardTitle}>💬 留言板</h2>
        <div className={styles.boardForm}>
          <input
            className={`input ${styles.boardName}`}
            type="text"
            placeholder="你的昵称（1-20字）"
            maxLength={20}
            value={msgName}
            onChange={(e) => setMsgName(e.target.value)}
          />
          <textarea
            className={`input ${styles.boardContent}`}
            placeholder="写下你的留言（1-500字）…"
            maxLength={500}
            rows={2}
            value={msgContent}
            onChange={(e) => setMsgContent(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy} onClick={submitMessage}>
            {busy ? '提交中…' : '发布留言'}
          </button>
        </div>
        {messages.length > 0 && (
          <div className={styles.boardList}>
            {messages.slice(0, 5).map((m) => (
              <div key={m.id} className={styles.boardItem}>
                <span className={styles.boardAvatar}>{m.username[0]?.toUpperCase()}</span>
                <div className={styles.boardBody}>
                  <div className={styles.boardMeta}>
                    <strong>{m.username}</strong>
                    <span>{fmtMsgTime(m.createdAt)}</span>
                  </div>
                  <p>{m.content}</p>
                </div>
              </div>
            ))}
          </div>
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
