import { useCallback, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { useSaveGame } from '../shared/saveGame'
import { aiEngineMove } from '../shared/aiEngine'
import { toast } from '../../stores/toast'
import shared from '../shared/game.module.css'
import styles from './Go.module.css'
import {
  aiMove,
  bestOf,
  candidates,
  emptyBoard,
  makesKo,
  moveToText,
  scoreBoard,
  tryMove,
  type Board,
  type Stone,
} from './goLogic'

type Difficulty = 'easy' | 'medium' | 'hard'

const DIFFS: Array<{ id: Difficulty; label: string; score: number }> = [
  { id: 'easy', label: '简单', score: 500 },
  { id: 'medium', label: '中等', score: 1000 },
  { id: 'hard', label: '困难', score: 1600 },
]

const SIZE = 19
const STAR_POINTS = new Set([
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15],
].flatMap(([r, c]) => [r * SIZE + c]))

export default function Go({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [board, setBoard] = useState<Board>(() => emptyBoard())
  const [current, setCurrent] = useState<Stone>(1) // 黑先
  const [lastMove, setLastMove] = useState<number>(-1)
  const [koPoint, setKoPoint] = useState<number | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [playerColor, setPlayerColor] = useState<Stone>(1) // 玩家黑或白
  const [passes, setPasses] = useState(0)
  const [score, setScore] = useState(0)
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | null>(null)
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
  const koRef = useRef(koPoint)
  koRef.current = koPoint
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty
  const passesRef = useRef(passes)
  passesRef.current = passes
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  /** AI 回合序号：每次发起 +1，旧回合的异步结果到达时直接丢弃 */
  const aiRunId = useRef(0)

  const ai: Stone = playerColor === 1 ? 2 : 1

  const finalize = useCallback(() => {
    const { black, white } = scoreBoard(boardRef.current)
    const playerIsBlack = playerRef.current === 1
    const playerScore = playerIsBlack ? black : white
    const aiScore = playerIsBlack ? white : black
    let final = 0
    if (playerScore > aiScore) {
      const diff = Math.round(playerScore - aiScore)
      final = (DIFFS.find((d) => d.id === diffRef.current)?.score ?? 500) + diff * 5
      setResult('win')
    } else if (playerScore < aiScore) {
      final = 0
      setResult('lose')
    } else {
      final = 50
      setResult('draw')
    }
    setScore(final)
    setStatus('over')
    gameOverRef.current(final)
  }, [])

  const place = useCallback(
    (i: number, color: Stone) => {
      const r = tryMove(boardRef.current, i, color, koRef.current)
      if (r.illegal) {
        if (color === playerRef.current) toast('禁着点：自杀或打劫', 'error')
        return false
      }
      const next = r.board
      setBoard(next)
      boardRef.current = next
      setLastMove(i)
      // 打劫：提 1 子则记为劫点。落点不是劫点，被提的那个空位才是
      const newKo = makesKo(r)
      setKoPoint(newKo)
      koRef.current = newKo
      setPasses(0)
      passesRef.current = 0
      const nxt: Stone = color === 1 ? 2 : 1
      setCurrent(nxt)
      currentRef.current = nxt
      return true
    },
    [],
  )

  const doAIMove = useCallback(async () => {
    if (statusRef.current !== 'running') return
    const runId = ++aiRunId.current
    setThinking(true)
    // 全部合法落子点（排除劫点），供 AI 模型从中挑选
    const b = boardRef.current
    const ko = koRef.current
    const legal = candidates(b)
      .filter((i) => b[i] === 0 && !tryMove(b, i, ai, ko).illegal)
      .map((i) => ({ text: moveToText(i), move: i }))
    const { move, engine } = await aiEngineMove<number>({
      game: 'go',
      level: diffRef.current,
      legal,
      side: String(ai),
      search: (pool) => bestOf(b, ai, ko, pool),
      local: () => aiMove(b, ai, ko, diffRef.current),
    })
    if (runId !== aiRunId.current || statusRef.current !== 'running') return
    setAiSrc(engine)
    if (move === null) {
      // AI 虚手（无合理走法或优势足够则 pass）
      setPasses((p) => {
        const np = p + 1
        passesRef.current = np
        if (np >= 2) finalize()
        else toast('AI 虚手', 'info')
        return np
      })
      setCurrent(playerRef.current)
      currentRef.current = playerRef.current
    } else {
      place(move, ai)
    }
    setThinking(false)
  }, [ai, place, finalize])

  const { hasSave, resume, reset } = useSaveGame<{
    board: Board
    current: Stone
    lastMove: number
    koPoint: number | null
    passes: number
  }>(
    'go',
    status,
    () => ({ board, current, lastMove, koPoint, passes }),
    (s) => {
      aiRunId.current++
      setBoard(s.board)
      boardRef.current = s.board
      setCurrent(s.current)
      currentRef.current = s.current
      setLastMove(s.lastMove)
      setKoPoint(s.koPoint)
      koRef.current = s.koPoint
      setPasses(s.passes)
      passesRef.current = s.passes
      setResult(null)
      setScore(0)
      setThinking(false)
      setAiSrc('local')
    },
    () => score,
  )

  const start = useCallback(() => {
    reset()
    aiRunId.current++
    const b = emptyBoard()
    setBoard(b)
    boardRef.current = b
    setCurrent(1)
    currentRef.current = 1
    setLastMove(-1)
    setKoPoint(null)
    koRef.current = null
    setPasses(0)
    passesRef.current = 0
    setResult(null)
    setScore(0)
    setThinking(false)
    setAiSrc('local')
    setStatus('running')
    // setStatus 要到下一轮渲染才同步进 statusRef，而 doAIMove 读的是 ref；
    // 不手动补一下，选「执白」开局时 AI 那一手会被自己的守卫条件挡掉
    statusRef.current = 'running'
    if (playerRef.current === 2) void doAIMove()
  }, [doAIMove, reset])

  const onCellClick = useCallback(
    (i: number) => {
      if (statusRef.current !== 'running') return
      if (currentRef.current !== playerRef.current || thinking) return
      if (boardRef.current[i] !== 0) return
      const ok = place(i, playerRef.current)
      if (ok) doAIMove()
    },
    [place, doAIMove, thinking],
  )

  const pass = useCallback(() => {
    if (statusRef.current !== 'running') return
    if (currentRef.current !== playerRef.current || thinking) return
    setPasses((p) => {
      const np = p + 1
      passesRef.current = np
      if (np >= 2) {
        finalize()
      } else {
        toast('你虚手，轮到 AI', 'info')
        doAIMove()
      }
      return np
    })
    const nxt: Stone = playerRef.current === 1 ? 2 : 1
    setCurrent(nxt)
    currentRef.current = nxt
    // 虚手清除劫点
    setKoPoint(null)
    koRef.current = null
  }, [doAIMove, finalize, thinking])

  const { black, white } = scoreBoard(board)

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
            {playerColor === 1 ? '● 黑' : '○ 白'}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>形势</span>
          <span className={shared.hudValue}>
            {Math.round(black)}:{Math.round(white)}
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
            {board.map((v, i) => {
              const isLast = i === lastMove
              const isKo = i === koPoint
              const isStar = STAR_POINTS.has(i) && v === 0
              return (
                <div
                  key={i}
                  className={styles.cell}
                  onClick={() => onCellClick(i)}
                >
                  {isStar && <span className={styles.starPoint} />}
                  {isKo && <span className={styles.koMark} />}
                  {v !== 0 && (
                    <span
                      className={[
                        styles.stone,
                        v === 1 ? styles.black : styles.white,
                        isLast ? styles.last : '',
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
              result === 'win' ? '胜利得分' : result === 'lose' ? '失败' : '和局'
            }
            onStart={start}
            onResume={() => setStatus('running')}
            onRestart={start}
            hasSave={hasSave}
            onResumeSave={() => {
              if (!resume()) return
              setStatus('running')
              statusRef.current = 'running'
              // 存档时正轮到 AI，续接就要把这一手补上
              if (currentRef.current !== playerRef.current) void doAIMove()
            }}
            idleTitle="围棋"
            idleHint="19×19 棋盘，提子/打劫/数目。双方虚手即终局，黑贴 6.5 目"
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
          <button type="button" className={styles.chip} onClick={pass} disabled={thinking}>
            ✋ 虚手 (Pass)
          </button>
          <p className={styles.tip}>
            落子围地提子。连续两次虚手即终局数目。黑贴白 6.5 目。
            中等/困难由 AI 生成候选（游客免验证可直接用，失败自动回落本地）。
          </p>
        </div>
      </div>
    </div>
  )
}
