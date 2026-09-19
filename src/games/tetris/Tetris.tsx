import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import shared from '../shared/game.module.css'
import styles from './Tetris.module.css'
import { useGameKeys } from '../shared/useGameKeys'

const COLS = 10
const ROWS = 20
const CELL = 24
const W = COLS * CELL
const H = ROWS * CELL

// 7 种方块的初始矩阵与颜色
const PIECES: Array<{ m: number[][]; color: string }> = [
  { m: [[1, 1, 1, 1]], color: '#00e5ff' }, // I
  {
    m: [
      [1, 1],
      [1, 1],
    ],
    color: '#ffd166',
  }, // O
  {
    m: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    color: '#c77dff',
  }, // T
  {
    m: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: '#3ddc97',
  }, // S
  {
    m: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: '#ff5c5c',
  }, // Z
  {
    m: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: '#5c8dff',
  }, // J
  {
    m: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: '#ffa94d',
  }, // L
]

const LINE_SCORES = [0, 100, 300, 500, 800]

interface Active {
  m: number[][]
  color: string
  x: number
  y: number
}

function rotate(m: number[][]): number[][] {
  return m[0].map((_, i) => m.map((row) => row[i]).reverse())
}

function collide(
  board: number[][],
  m: number[][],
  px: number,
  py: number,
): boolean {
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (!m[y][x]) continue
      const bx = px + x
      const by = py + y
      if (bx < 0 || bx >= COLS || by >= ROWS) return true
      if (by >= 0 && board[by][bx]) return true
    }
  }
  return false
}

export default function Tetris({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(1)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef(status)
  statusRef.current = status
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver

  const boardRef = useRef<number[][]>([])
  const activeRef = useRef<Active | null>(null)
  const nextRef = useRef<Active | null>(null)
  const bagRef = useRef<number[]>([])
  const scoreRef = useRef(0)
  const linesRef = useRef(0)
  const dropAccRef = useRef(0)

  const drawPieceFromBag = useCallback((): Active => {
    if (bagRef.current.length < 2) {
      const bag = [0, 1, 2, 3, 4, 5, 6]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
      bagRef.current.push(...bag)
    }
    const idx = bagRef.current.shift()!
    const piece = PIECES[idx]
    return {
      m: piece.m.map((row) => [...row]),
      color: piece.color,
      x: Math.floor((COLS - piece.m[0].length) / 2),
      y: -1,
    }
  }, [])

  const reset = useCallback(() => {
    boardRef.current = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => 0),
    )
    nextRef.current = null
    activeRef.current = drawPieceFromBag()
    nextRef.current = drawPieceFromBag()
    bagRef.current = []
    scoreRef.current = 0
    linesRef.current = 0
    dropAccRef.current = 0
    setScore(0)
    setLines(0)
    setLevel(1)
  }, [drawPieceFromBag])

  const start = useCallback(() => {
    reset()
    setStatus('running')
  }, [reset])

  const togglePause = useCallback(() => {
    if (statusRef.current === 'running') setStatus('paused')
    else if (statusRef.current === 'paused') setStatus('running')
  }, [])

  const lockPiece = useCallback(() => {
    const active = activeRef.current
    const board = boardRef.current
    if (!active) return
    active.m.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v && active.y + y >= 0) board[active.y + y][active.x + x] = 1
      }),
    )

    // 消行与计分
    const fullRows = board
      .map((row, i) => (row.every((c) => c) ? i : -1))
      .filter((i) => i >= 0)
    if (fullRows.length > 0) {
      const n = fullRows.length
      linesRef.current += n
      scoreRef.current += LINE_SCORES[n] * levelRef.current
      setLines(linesRef.current)
      setScore(scoreRef.current)
      setLevel(Math.floor(linesRef.current / 10) + 1)
      const kept = board.filter((_, i) => !fullRows.includes(i))
      while (kept.length < ROWS)
        kept.unshift(Array.from({ length: COLS }, () => 0))
      boardRef.current = kept
    }

    // 生成下一块
    const next = nextRef.current ?? drawPieceFromBag()
    activeRef.current = next
    nextRef.current = drawPieceFromBag()
    if (collide(boardRef.current, next.m, next.x, next.y)) {
      setStatus('over')
      gameOverRef.current(scoreRef.current)
    }
  }, [drawPieceFromBag])

  // level 需要在 lockPiece 中读取，用 ref 保存
  const levelRef = useRef(1)
  levelRef.current = level

  const move = useCallback((dx: number) => {
    const a = activeRef.current
    if (!a || statusRef.current !== 'running') return
    if (!collide(boardRef.current, a.m, a.x + dx, a.y)) a.x += dx
  }, [])

  const softDrop = useCallback(() => {
    const a = activeRef.current
    if (!a || statusRef.current !== 'running') return
    if (!collide(boardRef.current, a.m, a.x, a.y + 1)) {
      a.y += 1
      scoreRef.current += 1
      setScore(scoreRef.current)
      dropAccRef.current = 0
    } else {
      lockPiece()
    }
  }, [lockPiece])

  const hardDrop = useCallback(() => {
    const a = activeRef.current
    if (!a || statusRef.current !== 'running') return
    let dist = 0
    while (!collide(boardRef.current, a.m, a.x, a.y + 1)) {
      a.y += 1
      dist++
    }
    scoreRef.current += dist * 2
    setScore(scoreRef.current)
    lockPiece()
  }, [lockPiece])

  const rotatePiece = useCallback(() => {
    const a = activeRef.current
    if (!a || statusRef.current !== 'running') return
    const rotated = rotate(a.m)
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collide(boardRef.current, rotated, a.x + kick, a.y)) {
        a.m = rotated
        a.x += kick
        return
      }
    }
  }, [])

  useGameKeys({
    arrowleft: () => move(-1),
    arrowright: () => move(1),
    arrowup: rotatePiece,
    x: rotatePiece,
    arrowdown: () => softDrop(),
    ' ': () => hardDrop(),
    p: togglePause,
  })

  // ---------- 触屏手势 ----------
  // 左右滑动移动、下滑硬降、点按旋转、长按软降。
  // 操作条始终可见，手势作为更快的补充手段。
  const gesture = useRef<{
    x: number
    y: number
    originX: number
    handled: boolean
    longPress: number | null
    hardDropped: boolean
  } | null>(null)

  const HORIZONTAL_STEP = 26 // 每滑过这么多像素移动一格
  const HARD_DROP_DISTANCE = 56
  const TAP_SLOP = 12

  const clearGesture = () => {
    const g = gesture.current
    if (g?.longPress !== null && g?.longPress !== undefined) {
      window.clearInterval(g.longPress)
      g.longPress = null
    }
  }

  const onStageTouchStart = (e: React.TouchEvent) => {
    if (statusRef.current !== 'running') return
    const t = e.touches[0]
    clearGesture()
    gesture.current = {
      x: t.clientX,
      y: t.clientY,
      originX: t.clientX,
      handled: false,
      hardDropped: false,
      longPress: window.setTimeout(() => {
        // 长按：连续软降
        const g = gesture.current
        if (!g) return
        g.handled = true
        softDrop()
        g.longPress = window.setInterval(() => softDrop(), 60)
      }, 320),
    }
  }

  const onStageTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current
    if (!g || statusRef.current !== 'running') return
    const t = e.touches[0]
    const dx = t.clientX - g.originX
    const dy = t.clientY - g.y

    // 横向为主 → 按步进移动方块
    if (Math.abs(dx) >= HORIZONTAL_STEP && Math.abs(dx) > Math.abs(dy)) {
      clearGesture()
      const steps = Math.trunc(dx / HORIZONTAL_STEP)
      for (let i = 0; i < Math.abs(steps); i++) move(steps > 0 ? 1 : -1)
      g.originX += steps * HORIZONTAL_STEP
      g.handled = true
      return
    }

    // 纵向下拉 → 硬降（一次手势只触发一次）
    if (dy >= HARD_DROP_DISTANCE && Math.abs(dy) > Math.abs(dx) && !g.hardDropped) {
      clearGesture()
      g.hardDropped = true
      g.handled = true
      hardDrop()
    }
  }

  const onStageTouchEnd = (e: React.TouchEvent) => {
    const g = gesture.current
    clearGesture()
    gesture.current = null
    if (!g || statusRef.current !== 'running') return
    if (g.handled) return
    // 几乎没移动 → 视为点按，旋转
    const t = e.changedTouches[0]
    const dist = Math.hypot(t.clientX - g.x, t.clientY - g.y)
    if (dist <= TAP_SLOP) rotatePiece()
  }

  useEffect(() => clearGesture, [])

  // 主循环 + 渲染
  useEffect(() => {
    if (status !== 'running') return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    let last = performance.now()

    const gravityInterval = () =>
      Math.max(80, 820 - (levelRef.current - 1) * 70)

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop)
      const active = activeRef.current
      const board = boardRef.current
      if (!active || !board) return

      const dt = Math.min(ts - last, 250)
      last = ts
      dropAccRef.current += dt
      while (dropAccRef.current >= gravityInterval()) {
        dropAccRef.current -= gravityInterval()
        if (!collide(board, active.m, active.x, active.y + 1)) {
          active.y += 1
        } else {
          lockPiece()
          break
        }
      }

      // ---- 绘制 ----
      ctx.fillStyle = '#070912'
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 1; x < COLS; x++) {
        ctx.moveTo(x * CELL, 0)
        ctx.lineTo(x * CELL, H)
      }
      for (let y = 1; y < ROWS; y++) {
        ctx.moveTo(0, y * CELL)
        ctx.lineTo(W, y * CELL)
      }
      ctx.stroke()

      const cur = activeRef.current
      if (!cur) return

      // 幽灵投影
      let gy = cur.y
      while (!collide(board, cur.m, cur.x, gy + 1)) gy += 1
      cur.m.forEach((row, y) =>
        row.forEach((v, x) => {
          if (!v || gy + y < 0) return
          ctx.strokeStyle = 'rgba(255,255,255,0.16)'
          ctx.strokeRect(
            (cur.x + x) * CELL + 2,
            (gy + y) * CELL + 2,
            CELL - 4,
            CELL - 4,
          )
        }),
      )

      // 已锁定方块
      board.forEach((row, y) =>
        row.forEach((c, x) => {
          if (!c) return
          ctx.fillStyle = '#3d4a75'
          ctx.fillRect(x * CELL + 1.5, y * CELL + 1.5, CELL - 3, CELL - 3)
        }),
      )

      // 当前方块
      cur.m.forEach((row, y) =>
        row.forEach((v, x) => {
          if (!v || cur.y + y < 0) return
          ctx.fillStyle = cur.color
          ctx.shadowColor = cur.color
          ctx.shadowBlur = 8
          ctx.fillRect(
            (cur.x + x) * CELL + 1.5,
            (cur.y + y) * CELL + 1.5,
            CELL - 3,
            CELL - 3,
          )
          ctx.shadowBlur = 0
        }),
      )

      // Next 预览
      const next = nextRef.current
      ctx.fillStyle = '#131829'
      ctx.fillRect(W - 74, 12, 62, 62)
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.strokeRect(W - 74, 12, 62, 62)
      if (next) {
        const ox = W - 74 + (62 - next.m[0].length * 13) / 2
        const oy = 12 + (62 - next.m.length * 13) / 2
        next.m.forEach((row, y) =>
          row.forEach((v, x) => {
            if (!v) return
            ctx.fillStyle = next.color
            ctx.fillRect(ox + x * 13 + 1, oy + y * 13 + 1, 11, 11)
          }),
        )
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [status, lockPiece])

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>得分</span>
          <span className={shared.hudValue}>{score}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>消行</span>
          <span className={shared.hudValue}>{lines}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>等级</span>
          <span className={shared.hudValue}>{level}</span>
        </div>
      </div>

      <div
        className={shared.stage}
        style={{ maxWidth: `min(${W}px, 100%)`, aspectRatio: `${COLS} / ${ROWS}` }}
        onTouchStart={onStageTouchStart}
        onTouchMove={onStageTouchMove}
        onTouchEnd={onStageTouchEnd}
        onTouchCancel={onStageTouchEnd}
      >
        <canvas
          ref={canvasRef}
          width={W * 2}
          height={H * 2}
          className={styles.canvas}
        />
        <GameOverlay
          status={status}
          score={score}
          onStart={start}
          onResume={() => setStatus('running')}
          onRestart={start}
          idleHint="键盘：← → 移动 · ↑ 旋转 · ↓ 软降 · 空格硬降。手机上可左右滑动、下滑硬降、点按旋转"
        />
      </div>

      {/* 贴底操作条：始终可见，不会被推到屏幕外 */}
      <div className={shared.touchBar}>
        <button
          type="button"
          className={shared.touchBtn}
          onClick={() => move(-1)}
          aria-label="左移"
        >
          ←
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          onClick={rotatePiece}
          aria-label="旋转"
        >
          ↻
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          onClick={() => move(1)}
          aria-label="右移"
        >
          →
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          onClick={() => softDrop()}
          aria-label="软降"
        >
          ↓
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          onClick={() => hardDrop()}
          aria-label="硬降"
        >
          ⤓
        </button>
      </div>
    </div>
  )
}
