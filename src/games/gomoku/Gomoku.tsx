import { useCallback, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { aiEngineMove } from '../shared/aiEngine'
import shared from '../shared/game.module.css'
import styles from './Gomoku.module.css'
import {
  aiMove,
  bestOf,
  candidates,
  emptyBoard,
  idx,
  isFull,
  isWin,
  moveToText,
  SIZE,
  type Board,
  type Difficulty,
  type Stone,
} from './gomokuLogic'

const DIFFS: Array<{ id: Difficulty; label: string; score: number }> = [
  { id: 'easy', label: '简单', score: 300 },
  { id: 'medium', label: '中等', score: 600 },
  { id: 'hard', label: '困难', score: 1000 },
]

const STAR_POINTS = new Set([
  [3, 3], [7, 7], [11, 3],
  [3, 11], [11, 11],
].flatMap(([r, c]) => [r * SIZE + c]))

export default function Gomoku({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [board, setBoard] = useState<Board>(() => emptyBoard())
  const [current, setCurrent] = useState<Stone>(1) // 1 黑先
  const [lastMove, setLastMove] = useState<number>(-1)
  const [winLine, setWinLine] = useState<number[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [playerColor, setPlayerColor] = useState<Stone>(1) // 玩家黑或白
  const [over, setOver] = useState<'win' | 'lose' | 'draw' | null>(null)
  const [score, setScore] = useState(0)
  const [thinking, setThinking] = useState(false)
  /** 上一手 AI 实际使用的引擎；只有真的用到 CF 才显示标记 */
  const [aiSrc, setAiSrc] = useState<'cf' | 'local'>('local')

  const statusRef = useRef(status)
  statusRef.current = status
  const boardRef = useRef(board)
  boardRef.current = board
  const currentRef = useRef(current)
  currentRef.current = current
  const playerRef = useRef(playerColor)
  playerRef.current = playerColor
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  /** AI 回合序号：每次发起 +1，旧回合的异步结果到达时直接丢弃 */
  const aiRunId = useRef(0)

  const ai: Stone = playerColor === 1 ? 2 : 1

  const place = useCallback(
    (b: Board, x: number, y: number, stone: Stone) => {
      const next = [...b] as Board
      next[idx(x, y)] = stone
      setBoard(next)
      setLastMove(idx(x, y))
      boardRef.current = next
      if (isWin(next, x, y, stone)) {
        const line = winLineOf(next, x, y, stone)
        setWinLine(line)
        const playerWon = stone === playerRef.current
        setOver(playerWon ? 'win' : 'lose')
        const base = DIFFS.find((d) => d.id === diffRef.current)?.score ?? 300
        const final = playerWon ? base : 0
        setScore(final)
        setStatus('over')
        gameOverRef.current(final)
        return true
      }
      if (isFull(next)) {
        setOver('draw')
        setScore(50)
        setStatus('over')
        gameOverRef.current(50)
        return true
      }
      const nxt = (stone === 1 ? 2 : 1) as Stone
      setCurrent(nxt)
      currentRef.current = nxt
      return false
    },
    [],
  )

  const doAIMove = useCallback(async () => {
    if (statusRef.current !== 'running') return
    const runId = ++aiRunId.current
    setThinking(true)
    const { move, engine } = await aiEngineMove<[number, number]>({
      game: 'gomoku',
      level: diffRef.current,
      legal: candidates(boardRef.current).map((m) => ({ text: moveToText(m), move: m })),
      side: String(ai),
      search: (pool) => bestOf(boardRef.current, ai, pool),
      local: () => aiMove(boardRef.current, ai, diffRef.current),
    })
    if (runId !== aiRunId.current || statusRef.current !== 'running') return
    setAiSrc(engine)
    if (move) place(boardRef.current, move[0], move[1], ai)
    setThinking(false)
  }, [ai, place])

  const start = useCallback(() => {
    aiRunId.current++
    const b = emptyBoard()
    setBoard(b)
    boardRef.current = b
    setLastMove(-1)
    setWinLine([])
    setCurrent(1)
    currentRef.current = 1
    setOver(null)
    setScore(0)
    setThinking(false)
    setAiSrc('local')
    setStatus('running')
    // 若玩家选白，AI 先手
    if (playerRef.current === 2) void doAIMove()
  }, [doAIMove])

  const onCellClick = useCallback(
    (x: number, y: number) => {
      if (statusRef.current !== 'running') return
      if (thinking) return
      if (currentRef.current !== playerRef.current) return
      if (boardRef.current[idx(x, y)] !== 0) return
      const ended = place(boardRef.current, x, y, playerRef.current)
      if (!ended) void doAIMove()
    },
    [place, doAIMove, thinking],
  )

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>回合</span>
          <span className={shared.hudValue}>
            {current === 1 ? '● 黑' : '○ 白'}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>你</span>
          <span className={shared.hudValue}>
            {playerColor === 1 ? '● 黑(先)' : '○ 白(后)'}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>AI</span>
          <span className={shared.hudValue}>
            {DIFFS.find((d) => d.id === difficulty)?.label}
            {difficulty !== 'easy' && aiSrc === 'cf' && (
              <span className={shared.aiTag} title="本手由 AI 模型生成候选">
                · AI
              </span>
            )}
          </span>
        </div>
        {thinking && (
          <div className={shared.hudItem}>
            <span className={`${shared.hudValue} ${shared.thinking}`}>
              {difficulty === 'easy' ? '思考中…' : 'AI 思考中…'}
            </span>
          </div>
        )}
      </div>

      <div className={styles.sideRow}>
        <div className={`${shared.stage} ${styles.stagePad}`}>
          <div className={styles.board}>
            {/* 棋盘背景格线 */}
            {Array.from({ length: SIZE * SIZE }, (_, i) => {
              const x = i % SIZE
              const y = Math.floor(i / SIZE)
              const v = board[i]
              const isLast = i === lastMove
              const isWinCell = winLine.includes(i)
              const isStar = STAR_POINTS.has(i) && v === 0
              return (
                <div
                  key={i}
                  className={styles.cell}
                  onClick={() => onCellClick(x, y)}
                >
                  {isStar && <span className={styles.starPoint} />}
                  {v !== 0 && (
                    <span
                      className={[
                        styles.stone,
                        v === 1 ? styles.black : styles.white,
                        isLast ? styles.last : '',
                        isWinCell ? styles.winStone : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <GameOverlay
            status={status}
            score={score}
            scoreLabel={
              over === 'win' ? '胜利得分' : over === 'lose' ? '失败' : '平局'
            }
            onStart={start}
            onResume={() => setStatus('running')}
            onRestart={start}
            idleTitle="五子棋"
            idleHint="15×15 棋盘，五子连珠即胜。可选难度与先后手"
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
                  playerColor === 1 ? styles.chipOn : ''
                }`}
                onClick={() => setPlayerColor(1)}
              >
                ● 黑(先)
              </button>
              <button
                type="button"
                className={`${styles.chip} ${
                  playerColor === 2 ? styles.chipOn : ''
                }`}
                onClick={() => setPlayerColor(2)}
              >
                ○ 白(后)
              </button>
            </div>
          </div>
          <p className={styles.tip}>
            点击棋盘交点落子。形成横、竖、斜任意方向五连即胜。
            中等/困难由 AI 生成候选（游客需人机验证，失败自动回落本地）。
          </p>
        </div>
      </div>
    </div>
  )
}

/** 返回构成五连的 5 个格子索引（用于高亮）。 */
function winLineOf(board: Board, x: number, y: number, stone: Stone): number[] {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]
  for (const [dx, dy] of dirs) {
    const line: number[] = [idx(x, y)]
    for (let s = 1; s < 5; s++) {
      const nx = x + dx * s
      const ny = y + dy * s
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
      if (board[idx(nx, ny)] !== stone) break
      line.push(idx(nx, ny))
    }
    for (let s = 1; s < 5; s++) {
      const nx = x - dx * s
      const ny = y - dy * s
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
      if (board[idx(nx, ny)] !== stone) break
      line.unshift(idx(nx, ny))
    }
    if (line.length >= 5) return line.slice(0, 5)
  }
  return []
}
