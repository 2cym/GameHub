import { useCallback, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { toast } from '../../stores/toast'
import shared from '../shared/game.module.css'
import styles from './Go.module.css'
import {
  aiMove,
  emptyBoard,
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
  const aiTimer = useRef<number | null>(null)

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
      // 打劫：提 1 子则记为劫点
      const newKo = r.captured === 1 ? i : null
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

  const doAIMove = useCallback(() => {
    setThinking(true)
    const timer = window.setTimeout(() => {
      // AI 判断是否虚手（无合理走法或优势足够则 pass）
      const mv = aiMove(boardRef.current, ai, koRef.current, diffRef.current)
      if (mv === null) {
        // AI pass
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
        place(mv, ai)
      }
      setThinking(false)
    }, 400)
    aiTimer.current = timer
  }, [ai, place, finalize])

  const start = useCallback(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current)
    setBoard(emptyBoard())
    boardRef.current = emptyBoard()
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
    setStatus('running')
    if (playerRef.current === 2) {
      setThinking(true)
      aiTimer.current = window.setTimeout(() => {
        const mv = aiMove(emptyBoard(), ai, null, diffRef.current)
        if (mv !== null) place(mv, ai)
        setThinking(false)
      }, 400)
    }
  }, [ai, place])

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
        {thinking && (
          <div className={shared.hudItem}>
            <span className={shared.hudValue}>思考中…</span>
          </div>
        )}
      </div>

      <div className={styles.sideRow}>
        <div className={`${shared.stage} ${styles.stagePad}`}>
          <div className={styles.board}>
            {board.map((v, i) => {
              const isLast = i === lastMove
              const isKo = i === koPoint
              return (
                <div
                  key={i}
                  className={styles.cell}
                  onClick={() => onCellClick(i)}
                >
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
          <button type="button" className="btn" onClick={pass} disabled={thinking}>
            ✋ 虚手 (Pass)
          </button>
          <p className={styles.tip}>
            落子围地提子。连续两次虚手即终局数目。黑贴白 6.5 目。
          </p>
        </div>
      </div>
    </div>
  )
}
