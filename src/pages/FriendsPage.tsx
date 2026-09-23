import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { friendApi, roomApi, type FriendUser, type MatchHistory, type RoomSummary, type SearchResult } from '../lib/api'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './Friends.module.css'

const MATCH_GAMES = [
  { id: 'xiangqi', name: '中国象棋', emoji: '🀄' },
  { id: 'chess', name: '国际象棋', emoji: '♟️' },
  { id: 'gomoku', name: '五子棋', emoji: '⚫' },
  { id: 'go', name: '围棋', emoji: '⚫' },
]

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`
}

export function FriendsPage() {
  const { user, status, openAuth } = useAuth()
  const navigate = useNavigate()
  const [friends, setFriends] = useState<FriendUser[]>([])
  const [history, setHistory] = useState<MatchHistory[]>([])
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedGame, setSelectedGame] = useState('xiangqi')
  const [selectedColor, setSelectedColor] = useState('r')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (status !== 'authed') return
    setLoading(true)
    Promise.all([friendApi.list(), friendApi.matchHistory(), roomApi.list()])
      .then(([{ friends }, { history }, { rooms }]) => {
        setFriends(friends)
        setHistory(history)
        setRooms(rooms)
      })
      .catch(() => toast('加载失败', 'error'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => {
    if (search.trim().length < 1) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      friendApi.search(search.trim())
        .then((r) => setResults(r.users))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const handleAddFriend = async (id: string) => {
    setBusy(true)
    try {
      await friendApi.add(id)
      toast('已添加好友', 'success')
      setResults(results.filter((r) => r.id !== id))
      const r = await friendApi.list()
      setFriends(r.friends)
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveFriend = async (id: string) => {
    if (!confirm('确定移除该好友？')) return
    setBusy(true)
    try {
      await friendApi.remove(id)
      toast('已移除好友', 'success')
      setFriends(friends.filter((f) => f.id !== id))
    } catch (e) {
      toast(e instanceof Error ? e.message : '移除失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateRoom = async () => {
    setBusy(true)
    try {
      const { roomId } = await roomApi.create(selectedGame, selectedColor)
      toast(`房间已创建：${roomId}`, 'success')
      setShowCreate(false)
      navigate(`/match/${roomId}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '创建失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleJoinRoom = async (id: string) => {
    setBusy(true)
    try {
      await roomApi.join(id)
      toast('已加入对局', 'success')
      navigate(`/match/${id}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '加入失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleExitRoom = async (id: string) => {
    setBusy(true)
    try {
      await roomApi.exit(id)
      toast('已退出房间', 'success')
      setRooms(rooms.filter((r) => r.id !== id))
    } catch (e) {
      toast(e instanceof Error ? e.message : '退出失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return <div className={`container ${styles.page}`}><div className={styles.loading}><span className={styles.spinner} /> 加载中…</div></div>
  }

  if (!user) {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.guestPrompt}>
          <div className={styles.guestIcon}>🤝</div>
          <h1>好友与对战</h1>
          <p className={styles.emptyText}>登录后可以添加好友、发起棋类单挑</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => openAuth('login')}>
            登录 / 注册
          </button>
        </div>
      </div>
    )
  }

  const statusMap: Record<string, string> = {
    waiting: styles.statusWaiting,
    playing: styles.statusPlaying,
    finished: styles.statusFinished,
  }
  const statusLabel: Record<string, string> = {
    waiting: '等待中',
    playing: '进行中',
    finished: '已结束',
  }

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.header}>
        <h1 className={styles.title}>🤝 好友与对战</h1>
        <button className={styles.matchBtn} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '取消' : '➕ 发起对局'}
        </button>
      </div>

      {showCreate && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>发起棋类单挑</h2>
          <div className={styles.gameSelector}>
            {MATCH_GAMES.map((g) => (
              <button
                key={g.id}
                className={`${styles.gameChip} ${selectedGame === g.id ? styles.gameChipActive : ''}`}
                onClick={() => setSelectedGame(g.id)}
              >
                {g.emoji} {g.name}
              </button>
            ))}
          </div>
          <div className={styles.colorPicker}>
            <button
              className={`${styles.colorOpt} ${selectedColor === 'r' ? styles.colorOptActive : ''}`}
              onClick={() => setSelectedColor('r')}
            >
              <span className={`${styles.colorDot} ${styles.colorRed}`} /> 红方（先手）
            </button>
            <button
              className={`${styles.colorOpt} ${selectedColor === 'b' ? styles.colorOptActive : ''}`}
              onClick={() => setSelectedColor('b')}
            >
              <span className={`${styles.colorDot} ${styles.colorBlack}`} /> 黑方（后手）
            </button>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={handleCreateRoom}>
            {busy ? '创建中…' : '创建房间'}
          </button>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 10 }}>
            创建后将跳转到房间页面，将房间号分享给好友即可开始对局
          </p>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>🔍 搜索用户</h2>
        <div className={styles.searchRow}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="输入用户名或邮箱…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {results.length > 0 && (
          <div className={styles.results}>
            {results.map((r) => (
              <button
                key={r.id}
                className={styles.resultChip}
                disabled={busy}
                onClick={() => handleAddFriend(r.id)}
              >
                <span className={styles.friendAvatar} style={{ width: 24, height: 24, fontSize: 12 }}>
                  {r.username[0].toUpperCase()}
                </span>
                {r.username} {r.isBanned && '（已封禁）'} → 加好友
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>👥 我的好友（{friends.length}）</h2>
        {loading && !friends.length ? (
          <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>
        ) : friends.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>👥</div>
            <div className={styles.emptyText}>还没有好友，用上面的搜索框添加吧！</div>
          </div>
        ) : (
          <div className={styles.friendList}>
            {friends.map((f) => (
              <div key={f.id} className={styles.friendCard}>
                <div className={styles.friendAvatar}>
                  {f.username[0].toUpperCase()}
                </div>
                <div className={styles.friendInfo}>
                  <div className={styles.friendName}>
                    {f.username}
                    {f.isAdmin && <span className={`${styles.badge} ${styles.badgeAdmin}`}>管理</span>}
                    {f.isBanned && <span className={`${styles.badge} ${styles.badgeBanned}`}>封禁</span>}
                  </div>
                  <div className={styles.friendEmail}>{f.email}</div>
                </div>
                <div className={styles.friendActions}>
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    onClick={() => navigate(`/game/${selectedGame}?opponent=${f.username}`)}
                  >
                    ⚔️ 约战
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    disabled={busy}
                    onClick={() => handleRemoveFriend(f.id)}
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rooms.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>🎮 我的房间</h2>
          <div className={styles.roomList}>
            {rooms.map((r) => {
              const game = MATCH_GAMES.find((g) => g.id === r.game_id)
              return (
                <div key={r.id} className={styles.roomCard}>
                  <div className={styles.roomCardHeader}>
                    <span className={styles.roomGame}>{game?.emoji} {game?.name ?? r.game_id}</span>
                    <span className={`${styles.roomStatus} ${statusMap[r.status] ?? ''}`}>
                      {statusLabel[r.status] ?? r.status}
                    </span>
                  </div>
                  <div className={styles.roomMeta}>
                    {r.hostName ?? '未知'} vs {r.player_id ? '已加入' : '等待对手'} · {fmtTime(r.createdAt)}
                  </div>
                  <div className={styles.roomActions}>
                    {r.status === 'waiting' && r.host_id !== user.id ? (
                      <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} disabled={busy} onClick={() => handleJoinRoom(r.id)}>
                        加入
                      </button>
                    ) : r.status === 'waiting' ? (
                      <button className={styles.actionBtn} onClick={() => navigator.clipboard.writeText(r.id).then(() => toast('房间号已复制', 'info'))}>
                        复制房间号
                      </button>
                    ) : null}
                    {r.status !== 'finished' && (
                      <button className={styles.actionBtn} onClick={() => navigate(`/match/${r.id}`)}>
                        进入房间
                      </button>
                    )}
                    {r.status !== 'finished' && (
                      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} disabled={busy} onClick={() => handleExitRoom(r.id)}>
                        退出
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>📊 对战记录</h2>
        {loading && !history.length ? (
          <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>
        ) : history.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <div className={styles.emptyText}>还没有对战记录，发起一局吧！</div>
          </div>
        ) : (
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>游戏</th>
                <th>对手</th>
                <th>结果</th>
                <th>步数</th>
                <th>用时</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => {
                const game = MATCH_GAMES.find((g) => g.id === h.game_id)
                let result = '平局'
                let cls = styles.resultDraw
                if (h.winner) {
                  if (h.winner === user.id) { result = '胜利'; cls = styles.resultWin }
                  else if (h.winner === h.opponent_id) { result = '失败'; cls = styles.resultLose }
                  else { result = h.winner === 'resign' ? '对方认输' : '对方退出'; cls = styles.resultWin }
                }
                return (
                  <tr key={i}>
                    <td>{game?.emoji} {game?.name ?? h.game_id}</td>
                    <td>{h.opponentName ?? h.opponent_id}</td>
                    <td className={cls}>{result}</td>
                    <td>{h.moves}</td>
                    <td>{fmtDuration(h.duration)}</td>
                    <td>{fmtTime(h.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
