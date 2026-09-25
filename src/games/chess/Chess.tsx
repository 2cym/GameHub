import { useCallback, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { aiEngineMove } from '../shared/aiEngine'
import { toast } from '../../stores/toast'
import shared from '../shared/game.module.css'
import styles from './Chess.module.css'
import {
  aiMove,
  applyMove,
  bestOf,
  initialState,
  isCheckmate,
  isInCheck,
  isStalemate,
  legalMoves,
  legalTargets,
  moveToText,
  type Difficulty,
  type Move,
  type Side,
  type State,
  N,
} from './chessLogic'

const PIECE_GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

const DIFFS: Array<{ id: Difficulty; label: string; score: number }> = [
  { id: 'easy', label: '简单', score: 500 },
  { id: 'medium', label: '中等', score: 1000 },
  { id: 'hard', label: '困难', score: 1800 },
]

function isWhite(p: string | null) {
  return !!p && p === p.toUpperCase()
}

export default function Chess({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [state, setState] = useState<State>(() => initialState())
  const [selected, setSelected] = useState<number>(-1)
  const [targets, setTargets] = useState<number[]>([])
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [playerColor, setPlayerColor] = useState<Side>('w')
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | null>(null)
  const [score, setScore] = useState(0)
  const [thinking, setThinking] = useState(false)

  const statusRef = useRef(status)
  statusRef.current = status
  const stateRef = useRef(state)
  stateRef.current = state
  const playerRef = useRef(playerColor)
  playerRef.current = playerColor
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  /** AI 回合序号：每次发起 +1，旧回合的异步结果到达时直接丢弃 */
  const aiRunId = useRef(0)

  const aiSide: Side = playerColor === 'w' ? 'b' : 'w'

  const checkEnd = useCallback((s: State, mover: Side) => {
    const opp: Side = mover === 'w' ? 'b' : 'w'
    const oppState = { ...s, turn: opp }
    if (isCheckmate(oppState)) {
      const playerWon = mover === playerRef.current
      setResult(playerWon ? 'win' : 'lose')
      const base = DIFFS.find((d) => d.id === diffRef.current)?.score ?? 500
      const final = playerWon ? base : 0
      setScore(final)
      setStatus('over')
      gameOverRef.current(final)
      return true
    }
    if (isStalemate(oppState)) {
      setResult('draw')
      setScore(100)
      setStatus('over')
      gameOverRef.current(100)
      return true
    }
    if (isInCheck(oppState, opp)) {
      toast(opp === 'w' ? '白方被将！' : '黑方被将！', 'info')
    }
    return false
  }, [])

  const playMove = useCallback(
    (s: State, m: Move, mover: Side) => {
      // 兵升变默认选后（若需其他可后续扩展）
      if (!m.promo) {
        const p = s.board[m.from]
        if (p && p.toLowerCase() === 'p') {
          const ty = Math.floor(m.to / N)
          const promoRank = mover === 'w' ? 0 : 7
          if (ty === promoRank) m = { ...m, promo: 'q' }
        }
      }
      const ns = applyMove(s, m)
      setState(ns)
      stateRef.current = ns
      setLastMove(m)
      setSelected(-1)
      setTargets([])
      return checkEnd(ns, mover)
    },
    [checkEnd],
  )

  const doAIMove = useCallback(async () => {
    if (statusRef.current !== 'running') return
    const runId = ++aiRunId.current
    setThinking(true)
    const { move } = await aiEngineMove<Move>({
      game: 'chess',
      level: diffRef.current,
      legal: legalMoves(stateRef.current).map((m) => ({ text: moveToText(m), move: m })),
      side: aiSide,
      search: (pool) => bestOf(stateRef.current, pool, diffRef.current === 'hard' ? 4 : 2),
      local: () => aiMove(stateRef.current, diffRef.current),
    })
    if (runId !== aiRunId.current || statusRef.current !== 'running') return
    if (move) playMove(stateRef.current, move, aiSide)
    setThinking(false)
  }, [aiSide, playMove])

  const start = useCallback(() => {
    aiRunId.current++
    const s = initialState()
    setState(s)
    stateRef.current = s
    setSelected(-1)
    setTargets([])
    setLastMove(null)
    setResult(null)
    setScore(0)
    setThinking(false)
    setStatus('running')
    if (playerRef.current === 'b') void doAIMove()
  }, [doAIMove])

  const onCellClick = useCallback(
    (i: number) => {
      if (statusRef.current !== 'running') return
      if (stateRef.current.turn !== playerRef.current || thinking) return
      const piece = stateRef.current.board[i]
      const sideHere = piece ? (isWhite(piece) ? 'w' : 'b') : null
      if (sideHere === playerRef.current) {
        setSelected(i)
        setTargets(legalTargets(stateRef.current, i))
        return
      }
      if (selected >= 0 && targets.includes(i)) {
        const ended = playMove(stateRef.current, { from: selected, to: i }, playerRef.current)
        if (!ended) doAIMove()
        return
      }
      setSelected(-1)
      setTargets([])
    },
    [selected, targets, playMove, doAIMove, thinking],
  )

  // 翻转棋盘：玩家执黑时把黑放下方
  const flip = playerColor === 'b'
  const cells = []
  for (let viewY = 0; viewY < N; viewY++) {
    for (let viewX = 0; viewX < N; viewX++) {
      const x = flip ? 7 - viewX : viewX
      const y = flip ? 7 - viewY : viewY
      const i = y * N + x
      const p = state.board[i]
      const isSel = i === selected
      const isTarget = targets.includes(i)
      const isLastFrom = lastMove?.from === i
      const isLastTo = lastMove?.to === i
      const isLight = (viewX + viewY) % 2 === 1
      cells.push(
        <div
          key={i}
          className={[
            styles.cell,
            isLight ? styles.light : styles.dark,
            isSel ? styles.sel : '',
            isLastFrom ? styles.lastFrom : '',
            isLastTo ? styles.lastTo : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onCellClick(i)}
        >
          {isTarget && !p && <span className={styles.dot} />}
          {isTarget && p && <span className={styles.ring} />}
          {p && (
            <span
              className={[
                styles.piece,
                isWhite(p) ? styles.white : styles.black,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {PIECE_GLYPH[p]}
            </span>
          )}
        </div>,
      )
    }
  }

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>回合</span>
          <span className={shared.hudValue}>
            {state.turn === 'w' ? '⚪ 白' : '⚫ 黑'}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>你</span>
          <span className={shared.hudValue}>
            {playerColor === 'w' ? '⚪ 白(先)' : '⚫ 黑(后)'}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>AI</span>
          <span className={shared.hudValue}>
            {DIFFS.find((d) => d.id === difficulty)?.label}
            {difficulty !== 'easy' && (
              <span className={shared.aiTag} title="由 Cloudflare Workers AI 生成候选">
                · CF
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
          <div className={styles.board}>{cells}</div>

          <GameOverlay
            status={status}
            score={score}
            scoreLabel={
              result === 'win' ? '胜利得分' : result === 'lose' ? '失败' : '和局'
            }
            onStart={start}
            onResume={() => setStatus('running')}
            onRestart={start}
            idleTitle="国际象棋"
            idleHint="完整规则，含王车易位/吃过路兵/兵升变。选择难度与先后手"
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
                  playerColor === 'w' ? styles.chipOn : ''
                }`}
                onClick={() => setPlayerColor('w')}
              >
                ⚪ 白(先)
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
            点选己方棋子，绿点为可落子位置。将死对方王即胜。
            中等/困难由 Cloudflare AI 生成候选（需登录，失败自动回落本地）。
          </p>
        </div>
      </div>
    </div>
  )
}
