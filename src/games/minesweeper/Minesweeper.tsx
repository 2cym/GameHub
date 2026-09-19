import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import shared from '../shared/game.module.css'
import styles from './Minesweeper.module.css'

const SIZE = 9
const MINES = 10

interface Cell {
  mine: boolean
  revealed: boolean
  flagged: boolean
  count: number
}

function neighbors(i: number): number[] {
  const x = i % SIZE
  const y = Math.floor(i / SIZE)
  const result: number[] = []
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE)
        result.push(ny * SIZE + nx)
    }
  return result
}

function blankBoard(): Cell[] {
  return Array.from({ length: SIZE * SIZE }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    count: 0,
  }))
}

function placeMines(cells: Cell[], safeIndex: number): Cell[] {
  const next = cells.map((c) => ({ ...c }))
  const banned = new Set([safeIndex, ...neighbors(safeIndex)])
  let placed = 0
  while (placed < MINES) {
    const i = Math.floor(Math.random() * SIZE * SIZE)
    if (banned.has(i) || next[i].mine) continue
    next[i].mine = true
    placed++
  }
  for (let i = 0; i < next.length; i++) {
    if (next[i].mine) continue
    next[i].count = neighbors(i).filter((n) => next[n].mine).length
  }
  return next
}

function floodReveal(cells: Cell[], start: number): Cell[] {
  const next = cells.map((c) => ({ ...c }))
  const stack = [start]
  while (stack.length > 0) {
    const i = stack.pop()!
    const cell = next[i]
    if (cell.revealed || cell.flagged) continue
    cell.revealed = true
    if (cell.count === 0 && !cell.mine) {
      for (const n of neighbors(i)) {
        if (!next[n].revealed && !next[n].flagged) stack.push(n)
      }
    }
  }
  return next
}

const NUM_COLORS = [
  '',
  '#5c8dff',
  '#3ddc97',
  '#ff5c5c',
  '#c77dff',
  '#ffd166',
  '#7ceeff',
  '#e8ecff',
  '#9aa3c0',
]

/** 触觉反馈：iOS Safari 不支持，静默忽略 */
function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* 忽略 */
  }
}

export default function Minesweeper({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [cells, setCells] = useState<Cell[]>(blankBoard)
  const [flags, setFlags] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [timerOn, setTimerOn] = useState(false)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  /** 插旗模式：手机上右键不可用，用模式开关替代长按，彻底消除"挖还是插旗"的歧义 */
  const [flagMode, setFlagMode] = useState(false)

  const statusRef = useRef(status)
  statusRef.current = status
  const elapsedRef = useRef(0)
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  const longPressTimer = useRef<number | null>(null)

  // 计时器：首次翻开（布雷）后由 timerOn state 驱动启动
  useEffect(() => {
    if (!timerOn || status !== 'running') return
    const id = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => window.clearInterval(id)
  }, [timerOn, status])

  const start = useCallback(() => {
    setCells(blankBoard())
    setFlags(0)
    setElapsed(0)
    setTimerOn(false)
    setFinalScore(null)
    elapsedRef.current = 0
    setStatus('running')
  }, [])

  const finish = useCallback((won: boolean, board: Cell[]) => {
    if (won) {
      const score = Math.max(100, 999 - elapsedRef.current)
      setFinalScore(score)
      setCells(board.map((c) => (c.mine ? { ...c, flagged: true } : c)))
      setStatus('over')
      gameOverRef.current(score)
    } else {
      setFinalScore(0)
      setCells(board.map((c) => (c.mine ? { ...c, revealed: true } : c)))
      setStatus('over')
      gameOverRef.current(0)
    }
  }, [])

  const reveal = useCallback(
    (i: number) => {
      if (statusRef.current !== 'running') return
      const cell = cells[i]
      if (cell.flagged || cell.revealed) return

      let board = cells
      // 首次翻开：布雷 + 启动计时
      if (board.every((c) => !c.mine)) {
        board = placeMines(cells, i)
        elapsedRef.current = 0
        setElapsed(0)
        setTimerOn(true)
      }

      if (board[i].mine) {
        finish(false, board)
        return
      }

      const next = floodReveal(board, i)
      setCells(next)
      const revealedCount = next.filter((c) => c.revealed).length
      if (revealedCount === SIZE * SIZE - MINES) finish(true, next)
    },
    [cells, finish],
  )

  const toggleFlag = useCallback(
    (i: number) => {
      if (statusRef.current !== 'running') return
      const cell = cells[i]
      if (cell.revealed) return
      const next = cells.map((c, j) =>
        j === i ? { ...c, flagged: !c.flagged } : c,
      )
      setCells(next)
      setFlags(next.filter((c) => c.flagged).length)
      buzz(15)
    },
    [cells],
  )

  // 触屏长按插旗；点击（含键盘 Enter/空格）按当前模式行事
  const suppressClickRef = useRef(false)
  const LONG_PRESS_MS = 250

  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    longPressTimer.current = window.setTimeout(() => {
      suppressClickRef.current = true
      toggleFlag(i)
    }, LONG_PRESS_MS)
  }

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleClick = (i: number) => () => {
    // 长按插旗后浏览器仍会补发 click，需吞掉一次
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (flagMode) toggleFlag(i)
    else reveal(i)
  }

  useEffect(() => clearLongPress, [])

  const minesLeft = MINES - flags

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>💣 剩余雷数</span>
          <span className={shared.hudValue}>{minesLeft}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>用时</span>
          <span className={shared.hudValue}>{elapsed}s</span>
        </div>
      </div>

      <div className={`${shared.stage} ${styles.minesStage}`}>
        <div className={styles.grid} onContextMenu={(e) => e.preventDefault()}>
          {cells.map((cell, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.cell} ${cell.revealed ? styles.open : ''} ${
                cell.revealed && cell.mine ? styles.boom : ''
              } ${!cell.revealed && flagMode ? styles.flagArmed : ''}`}
              style={{ color: NUM_COLORS[cell.count] }}
              disabled={status === 'over'}
              aria-label={
                cell.revealed
                  ? `已翻开 ${cell.mine ? '地雷' : cell.count || '空白'}`
                  : cell.flagged
                    ? '已插旗'
                    : '未翻开'
              }
              onContextMenu={(e) => {
                e.preventDefault()
                toggleFlag(i)
              }}
              onPointerDown={onPointerDown(i)}
              onPointerUp={clearLongPress}
              onPointerCancel={clearLongPress}
              onPointerLeave={clearLongPress}
              onClick={handleClick(i)}
            >
              {cell.flagged && !cell.revealed
                ? '🚩'
                : cell.revealed
                  ? cell.mine
                    ? '💥'
                    : cell.count > 0
                      ? cell.count
                      : ''
                  : ''}
            </button>
          ))}
        </div>

        <GameOverlay
          status={status}
          score={finalScore ?? 0}
          scoreLabel={finalScore !== null && finalScore > 0 ? '用时得分' : '得分'}
          onStart={start}
          onResume={() => setStatus('running')}
          onRestart={start}
          idleHint="点格子挖开，长按或切到「插旗」模式标记地雷。首次点击必定安全！"
        />
      </div>

      {/* 模式开关：手机上右键不可用，用模式切换替代长按，避免挖错 */}
      <div className={styles.modeBar} role="group" aria-label="操作模式">
        <button
          type="button"
          className={`${styles.modeBtn} ${!flagMode ? styles.modeOn : ''}`}
          onClick={() => setFlagMode(false)}
          aria-pressed={!flagMode}
        >
          ⛏ 挖开
        </button>
        <button
          type="button"
          className={`${styles.modeBtn} ${flagMode ? styles.modeOn : ''}`}
          onClick={() => setFlagMode(true)}
          aria-pressed={flagMode}
        >
          🚩 插旗
        </button>
      </div>
    </div>
  )
}
