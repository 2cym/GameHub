import { useCallback, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { toast } from '../../stores/toast'
import shared from '../shared/game.module.css'
import styles from './Xiangqi.module.css'
import {
  aiMove,
  applyMove,
  initialBoard,
  isCheckmate,
  isInCheck,
  isStalemate,
  legalTargets,
  type Board,
  type Difficulty,
  type Move,
  type Side,
  COLS,
} from './xiangqiLogic'

const PIECE_NAME: Record<string, string> = {
  K: '帥',
  k: '將',
  A: '仕',
  a: '士',
  B: '相',
  b: '象',
  N: '馬',
  n: '馬',
  R: '車',
  r: '車',
  C: '炮',
  c: '砲',
  P: '兵',
  p: '卒',
}

const DIFFS: Array<{ id: Difficulty; label: string; score: number }> = [
  { id: 'easy', label: '简单', score: 400 },
  { id: 'medium', label: '中等', score: 800 },
  { id: 'hard', label: '困难', score: 1400 },
]

function isRed(p: string | null) {
  return !!p && p === p.toUpperCase()
}

export default function Xiangqi({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [board, setBoard] = useState<Board>(() => initialBoard())
  const [turn, setTurn] = useState<Side>('r') // 红先
  const [selected, setSelected] = useState<number>(-1)
  const [targets, setTargets] = useState<number[]>([])
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [playerColor, setPlayerColor] = useState<Side>('r')
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | null>(null)
  const [score, setScore] = useState(0)
  const [thinking, setThinking] = useState(false)

  const statusRef = useRef(status)
  statusRef.current = status
  const boardRef = useRef(board)
  boardRef.current = board
  const turnRef = useRef(turn)
  turnRef.current = turn
  const playerRef = useRef(playerColor)
  playerRef.current = playerColor
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  const aiTimer = useRef<number | null>(null)

  const aiSide: Side = playerColor === 'r' ? 'b' : 'r'

  const checkEnd = useCallback(
    (b: Board, mover: Side) => {
      const opp: Side = mover === 'r' ? 'b' : 'r'
      if (isCheckmate(b, opp) || isStalemate(b, opp)) {
        const playerWon = mover === playerRef.current
        setResult(playerWon ? 'win' : 'lose')
        const base = DIFFS.find((d) => d.id === diffRef.current)?.score ?? 400
        const final = playerWon ? base : 0
        setScore(final)
        setStatus('over')
        gameOverRef.current(final)
        return true
      }
      if (isInCheck(b, opp)) {
        toast(opp === 'r' ? '红方被将！' : '黑方被将！', 'info')
      }
      return false
    },
    [],
  )

  const playMove = useCallback(
    (b: Board, move: Move, mover: Side) => {
      const nb = applyMove(b, move)
      setBoard(nb)
      setLastMove(move)
      boardRef.current = nb
      setSelected(-1)
      setTargets([])
      const ended = checkEnd(nb, mover)
      if (ended) return true
      const nxt: Side = mover === 'r' ? 'b' : 'r'
      setTurn(nxt)
      turnRef.current = nxt
      return false
    },
    [checkEnd],
  )

  const doAIMove = useCallback(() => {
    setThinking(true)
    const timer = window.setTimeout(() => {
      const mv = aiMove(boardRef.current, aiSide, diffRef.current)
      if (mv) playMove(boardRef.current, mv, aiSide)
      setThinking(false)
    }, 400)
    aiTimer.current = timer
  }, [aiSide, playMove])

  const start = useCallback(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current)
    setBoard(initialBoard())
    setTurn('r')
    turnRef.current = 'r'
    setSelected(-1)
    setTargets([])
    setLastMove(null)
    setResult(null)
    setScore(0)
    setThinking(false)
    setStatus('running')
    // 玩家执黑则 AI 先走（红先）
    if (playerRef.current === 'b') {
      aiTimer.current = window.setTimeout(() => {
        const mv = aiMove(initialBoard(), 'r', diffRef.current)
        if (mv) playMove(initialBoard(), mv, 'r')
        setThinking(false)
      }, 400)
      setThinking(true)
    }
  }, [playMove])

  const onCellClick = useCallback(
    (i: number) => {
      if (statusRef.current !== 'running') return
      if (turnRef.current !== playerRef.current || thinking) return
      const piece = boardRef.current[i]
      const sideHere = piece ? (isRed(piece) ? 'r' : 'b') : null
      // 选中自己的子
      if (sideHere === playerRef.current) {
        setSelected(i)
        setTargets(legalTargets(boardRef.current, i, playerRef.current))
        return
      }
      // 已选中且点目标是合法落点
      if (selected >= 0 && targets.includes(i)) {
        const ended = playMove(boardRef.current, { from: selected, to: i }, playerRef.current)
        if (!ended) doAIMove()
        return
      }
      // 点空地或对方子（非目标）：取消选中
      setSelected(-1)
      setTargets([])
    },
    [selected, targets, playMove, doAIMove, thinking],
  )

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>回合</span>
          <span className={shared.hudValue}>
            {turn === 'r' ? '🔴 红' : '⚫ 黑'}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>你</span>
          <span className={shared.hudValue}>
            {playerColor === 'r' ? '🔴 红(先)' : '⚫ 黑(后)'}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>AI</span>
          <span className={shared.hudValue}>
            {DIFFS.find((d) => d.id === difficulty)?.label}
          </span>
        </div>
        {thinking && (
          <div className={shared.hudItem}>
            <span className={shared.hudValue}>思考中…</span>
          </div>
        )}
      </div>

      <div className={styles.sideRow}>
        <div className={`${shared.stage} ${styles.stagePad}`}>
          <div className={styles.board}>
            {/* 楚河汉界 */}
            <div className={styles.river}>楚 河 　 漢 界</div>
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
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    gridColumn: x + 1,
                    gridRow: y + 1,
                  }}
                  onClick={() => onCellClick(i)}
                >
                  {isTarget && !p && <span className={styles.dot} />}
                  {isTarget && p && <span className={styles.ring} />}
                  {p && (
                    <span
                      className={[
                        styles.piece,
                        isRed(p) ? styles.red : styles.black,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {PIECE_NAME[p]}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <GameOverlay
            status={status}
            score={score}
            scoreLabel={
              result === 'win' ? '胜利得分' : result === 'lose' ? '失败' : '和局'
            }
            onStart={start}
            onResume={() => setStatus('running')}
            onRestart={start}
            idleTitle="中国象棋"
            idleHint="完整走法，含蹩马腿/塞象眼/白脸将。选择难度与先后手"
          />
        </div>

        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>难度</span>
            <div className={styles.chips}>
              {DIFFS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`${styles.chip} ${
                    difficulty === d.id ? styles.chipOn : ''
                  }`}
                  onClick={() => setDifficulty(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>执子</span>
            <div className={styles.chips}>
              <button
                type="button"
                className={`${styles.chip} ${
                  playerColor === 'r' ? styles.chipOn : ''
                }`}
                onClick={() => setPlayerColor('r')}
              >
                🔴 红(先)
              </button>
              <button
                type="button"
                className={`${styles.chip} ${
                  playerColor === 'b' ? styles.chipOn : ''
                }`}
                onClick={() => setPlayerColor('b')}
              >
                ⚫ 黑(后)
              </button>
            </div>
          </div>
          <p className={styles.tip}>
            点选己方棋子，绿点为可落子位置。吃掉对方将/帅即胜。
          </p>
        </div>
      </div>
    </div>
  )
}
