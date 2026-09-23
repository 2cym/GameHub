import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { roomApi, type GameRoom } from '../lib/api'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import {
  type Board, type Move, type Side,
  COLS,
  initialBoard,
  applyMove,
  legalTargets,
  isCheckmate,
  isStalemate,
  isInCheck,
} from '../games/xiangqi/xiangqiLogic'
import styles from './Match.module.css'

const PIECE_NAME: Record<string, string> = {
  K: '帥', k: '將',
  A: '仕', a: '士',
  B: '相', b: '象',
  N: '馬', n: '馬',
  R: '車', r: '車',
  C: '炮', c: '砲',
  P: '兵', p: '卒',
}

const GAME_NAMES: Record<string, string> = {
  xiangqi: '中国象棋',
  chess: '国际象棋',
  gomoku: '五子棋',
  go: '围棋',
}

function isRed(p: string | null) {
  return !!p && p === p.toUpperCase()
}

export function MatchPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user, status } = useAuth()
  const navigate = useNavigate()
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Xiangqi board state
  const [board, setBoard] = useState<Board>(() => initialBoard())
  const [selected, setSelected] = useState(-1)
  const [targets, setTargets] = useState<number[]>([])
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [myColor, setMyColor] = useState<Side>('r')
  const [isMyTurn, setIsMyTurn] = useState(true)
  const [thinking, setThinking] = useState(false)
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | 'resign' | 'leave' | null>(null)
  const [movesCount, setMovesCount] = useState(0)

  const roomRef = useRef(room)
  roomRef.current = room
  const boardRef = useRef(board)
  boardRef.current = board
  const myColorRef = useRef(myColor)
  myColorRef.current = myColor
  const isMyTurnRef = useRef(isMyTurn)
  isMyTurnRef.current = isMyTurn
  const pollTimer = useRef<number | null>(null)

  // Load room
  useEffect(() => {
    if (!roomId) {
      setError('缺少房间号')
      setLoading(false)
      return
    }
    roomApi.get(roomId)
      .then((r) => {
        setRoom(r)
        // Determine my color
        const color = r.host_id === user?.id ? r.host_color : r.player_color
        setMyColor(color as Side)
        setIsMyTurn(r.current_turn === color)
        // Parse board state if exists
        try {
          const parsed = JSON.parse(r.board_state)
          if (Array.isArray(parsed) && parsed.length === 90) {
            setBoard(parsed)
          }
        } catch {
          // keep initial board
        }
        setMovesCount(r.moves_count)
        if (r.last_move) {
          try {
            setLastMove(JSON.parse(r.last_move))
          } catch {
            // ignore
          }
        }
        if (r.status === 'finished') {
          setResult('draw')
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [roomId, user?.id])

  // Poll for updates
  const pollRoom = useCallback(async () => {
    if (!roomId) return
    try {
      const r = await roomApi.get(roomId)
      roomRef.current = r
      setRoom(r)

      // Parse board state
      try {
        const parsed = JSON.parse(r.board_state)
        if (Array.isArray(parsed) && parsed.length === 90) {
          setBoard(parsed)
          boardRef.current = parsed
        }
      } catch {
        // ignore
      }

      setMovesCount(r.moves_count)
      if (r.last_move) {
        try {
          const lm = JSON.parse(r.last_move)
          if (typeof lm === 'object' && lm !== null && 'from' in lm) {
            setLastMove(lm as Move)
          }
        } catch {
          // ignore
        }
      }

      // Check if it's my turn
      const myC = r.host_id === user?.id ? r.host_color : r.player_color
      setIsMyTurn(r.current_turn === myC)

      // Check if game is finished
      if (r.status === 'finished') {
        // Determine result
        const myId = user?.id
        const lastMoveData = r.last_move ? JSON.parse(r.last_move) : null
        if (lastMoveData && typeof lastMoveData === 'object') {
          if (lastMoveData.resigned === myId) {
            setResult('resign')
          } else if (lastMoveData.left === myId) {
            setResult('leave')
          } else {
            // Check if I won
            const winner = lastMoveData.winner
            if (winner === myId) setResult('win')
            else if (winner === 'opponent') setResult('lose')
            else setResult('draw')
          }
        } else {
          setResult('draw')
        }
      }
    } catch {
      // polling error, ignore
    }
  }, [roomId, user?.id])

  // Start polling when in playing state
  useEffect(() => {
    if (!room || room.status !== 'playing') return
    if (pollTimer.current) window.clearInterval(pollTimer.current)
    pollTimer.current = window.setInterval(pollRoom, 2500)
    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [room?.status, pollRoom])

  const checkEnd = useCallback((b: Board, mover: Side) => {
    const opp: Side = mover === 'r' ? 'b' : 'r'
    if (isCheckmate(b, opp) || isStalemate(b, opp)) {
      const playerWon = mover === myColorRef.current
      setResult(playerWon ? 'win' : 'lose')
      return true
    }
    if (isInCheck(b, opp)) {
      toast(opp === 'r' ? '红方被将！' : '黑方被将！', 'info')
    }
    return false
  }, [])

  const onCellClick = useCallback((i: number) => {
    if (!roomRef.current || roomRef.current.status !== 'playing') return
    if (!isMyTurnRef.current) return

    const b = boardRef.current
    const p = b[i]
    const sideHere = p ? (isRed(p) ? 'r' : 'b') : null

    // Select own piece
    if (sideHere === myColorRef.current) {
      setSelected(i)
      setTargets(legalTargets(b, i, myColorRef.current))
      return
    }

    // Make move if target is valid
    if (selected >= 0 && targets.includes(i)) {
      const move: Move = { from: selected, to: i }
      const newBoard = applyMove(b, move)

      // Apply locally
      setBoard(newBoard)
      boardRef.current = newBoard
      setLastMove(move)
      setSelected(-1)
      setTargets([])
      setMovesCount((m) => m + 1)

      // Check end
      const ended = checkEnd(newBoard, myColorRef.current)

      // Send to server
      if (roomId) {
        roomApi.move(roomId, { ...move, board: newBoard })
          .then((res) => {
            setIsMyTurn(res.currentTurn === myColorRef.current)
            setMovesCount(res.movesCount)
          })
          .catch((e) => {
            toast(e instanceof Error ? e.message : '走棋失败', 'error')
            // Revert
            setBoard(b)
            boardRef.current = b
          })
      }

      if (!ended && roomId) {
        setThinking(true)
        // The poll will handle the opponent's turn
        setTimeout(() => setThinking(false), 3000)
      }
      return
    }

    // Cancel selection
    setSelected(-1)
    setTargets([])
  }, [selected, targets, roomId, checkEnd])

  const handleResign = async () => {
    if (!roomId) return
    if (!confirm('确定认输吗？')) return
    try {
      await roomApi.resign(roomId)
      setResult('resign')
      toast('你已认输', 'info')
    } catch (e) {
      toast(e instanceof Error ? e.message : '认输失败', 'error')
    }
  }

  const handleExit = async () => {
    if (!roomId) return
    if (!confirm('确定退出房间？')) return
    try {
      await roomApi.exit(roomId)
      toast('已退出房间', 'success')
      navigate('/friends')
    } catch (e) {
      toast(e instanceof Error ? e.message : '退出失败', 'error')
    }
  }

  const copyRoomCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId).then(() => toast('房间号已复制', 'info'))
    }
  }

  if (status === 'loading') {
    return <div className={`container ${styles.page}`}><div className={styles.loading}><span className={styles.spinner} /> 加载中…</div></div>
  }

  if (status !== 'authed') {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.waitingState}>
          <div className={styles.waitingIcon}>🔒</div>
          <h1 className={styles.waitingTitle}>需要登录</h1>
          <p className={styles.waitingText}>请先登录后再参与好友对战</p>
          <Link to="/" className="btn btn-primary">返回首页</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className={`container ${styles.page}`}><div className={styles.loading}><span className={styles.spinner} /> 加载房间…</div></div>
  }

  if (error) {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.waitingState}>
          <div className={styles.waitingIcon}>❌</div>
          <h1 className={styles.waitingTitle}>加载失败</h1>
          <p className={styles.waitingText}>{error}</p>
          <Link to="/friends" className="btn btn-primary">返回好友页</Link>
        </div>
      </div>
    )
  }

  if (!room) return null

  const gameName = GAME_NAMES[room.game_id] ?? room.game_id

  // Waiting state
  if (room.status === 'waiting') {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.header}>
          <h1 className={styles.title}>{gameName} 对战</h1>
          <div className={styles.roomInfo}>
            <span className={styles.roomCode}>{room.id}</span>
            <button className={styles.copyBtn} onClick={copyRoomCode}>复制</button>
          </div>
        </div>
        <div className={styles.waitingState}>
          <div className={styles.waitingIcon}>⏳</div>
          <h1 className={styles.waitingTitle}>等待对手加入</h1>
          <p className={styles.waitingText}>
            将房间号分享给好友，好友加入后即可开始对局
          </p>
          <div className={styles.roomShareBox}>
            <span className={styles.roomShareLabel}>房间号：</span>
            <span className={styles.roomShareCode}>{room.id}</span>
            <button className={styles.copyBtn} onClick={copyRoomCode}>复制</button>
          </div>
          <div className={styles.actionRow}>
            <button className="btn btn-ghost" onClick={handleExit}>退出房间</button>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>刷新状态</button>
          </div>
        </div>
      </div>
    )
  }

  // Finished state
  if (room.status === 'finished') {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.header}>
          <h1 className={styles.title}>{gameName} 对战</h1>
          <div className={styles.roomInfo}>
            <span className={styles.roomCode}>{room.id}</span>
          </div>
        </div>
        <div className={styles.finishedState}>
          <div className={styles.finishedIcon}>🏁</div>
          <h1 className={styles.finishedTitle}>对局结束</h1>
          <div className={`resultBadge ${result === 'win' || result === 'resign' || result === 'leave' ? styles.resultWin : result === 'lose' ? styles.resultLose : styles.resultDraw}`}>
            {result === 'win' ? '🎉 胜利！' : result === 'lose' ? '💔 失败' : result === 'resign' ? '🏳️ 你已认输' : result === 'leave' ? '🚪 你已退出' : '🤝 平局'}
          </div>
          <p className={styles.finishedText}>共 {movesCount} 步</p>
          <div className={styles.actionRow}>
            <Link to="/friends" className="btn btn-primary">返回好友页</Link>
            <button className="btn btn-ghost" onClick={() => window.location.reload()}>刷新</button>
          </div>
        </div>
      </div>
    )
  }

  // Playing state - Xiangqi board
  const hostName = room.hostName ?? '房主'
  const playerName = room.playerName ?? '对手'
  const iAmHost = room.host_id === user?.id
  const myName = iAmHost ? hostName : playerName
  const oppName = iAmHost ? playerName : hostName

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{gameName} 对战</h1>
        <div className={styles.roomInfo}>
          <span className={styles.roomCode}>{room.id}</span>
          <button className={styles.copyBtn} onClick={copyRoomCode}>复制</button>
        </div>
      </div>

      <div className={styles.players}>
        <div className={styles.player} style={{ order: myColor === 'r' ? 1 : 2 }}>
          <div className={`playerAvatar ${myColor === 'r' ? styles.playerRed : styles.playerBlack}`}>
            {myName[0]?.toUpperCase()}
          </div>
          <span className={styles.playerName}>{myName}</span>
          <span className={styles.playerColor}>{myColor === 'r' ? '🔴 红方(先)' : '⚫ 黑方(后)'}</span>
        </div>
        <div className={styles.vs}>VS</div>
        <div className={styles.player} style={{ order: myColor === 'r' ? 2 : 1 }}>
          <div className={`playerAvatar ${myColor === 'r' ? styles.playerBlack : styles.playerRed}`}>
            {oppName[0]?.toUpperCase()}
          </div>
          <span className={styles.playerName}>{oppName}</span>
          <span className={styles.playerColor}>{myColor === 'r' ? '⚫ 黑方(后)' : '🔴 红方(先)'}</span>
        </div>
      </div>

      <div className={styles.hud}>
        <div className={styles.hudItem}>
          <span className={styles.hudLabel}>回合</span>
          <span className={styles.hudValue}>
            {room.current_turn === 'r' ? '🔴 红' : '⚫ 黑'}
          </span>
        </div>
        <div className={styles.hudItem}>
          <span className={styles.hudLabel}>你的回合</span>
          <span className={styles.hudValue}>{isMyTurn ? '✅' : '⏳'}</span>
        </div>
        <div className={styles.hudItem}>
          <span className={styles.hudLabel}>步数</span>
          <span className={styles.hudValue}>{movesCount}</span>
        </div>
        {thinking && (
          <div className={styles.hudItem}>
            <span className={styles.hudValue}>对手思考中…</span>
          </div>
        )}
      </div>

      <div className={styles.boardWrap}>
        <div className={styles.board}>
          {board.map((p, i) => {
            const x = i % COLS
            const y = Math.floor(i / COLS)
            const isSel = i === selected
            const isTarget = targets.includes(i)
            const isLastFrom = lastMove?.from === i
            const isLastTo = lastMove?.to === i
            return (
              <div
                key={i}
                className={[
                  styles.cell,
                  isSel ? styles.sel : '',
                  isLastFrom ? styles.lastFrom : '',
                  isLastTo ? styles.lastTo : '',
                ].filter(Boolean).join(' ')}
                style={{ gridColumn: x + 1, gridRow: y + 1 }}
                onClick={() => onCellClick(i)}
              >
                {isTarget && !p && <span className={styles.dot} />}
                {isTarget && p && <span className={styles.ring} />}
                {p && (
                  <span className={`${styles.piece} ${isRed(p) ? styles.pieceRed : styles.pieceBlack}`}>
                    {PIECE_NAME[p]}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.actionRow}>
        <button className="btn btn-ghost" onClick={handleResign}>🏳️ 认输</button>
        <button className="btn btn-ghost" onClick={handleExit}>🚪 退出房间</button>
      </div>

      <div className={styles.syncIndicator}>
        <span className={styles.syncDot} />
        每 2.5 秒自动同步对手走棋
      </div>
    </div>
  )
}
