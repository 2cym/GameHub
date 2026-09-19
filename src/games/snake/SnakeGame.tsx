import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import shared from '../shared/game.module.css'
import styles from './Snake.module.css'
import { useGameKeys } from '../shared/useGameKeys'

const GRID = 20
const CELL = 22
const SIZE = GRID * CELL
const BASE_INTERVAL = 150
const MIN_INTERVAL = 68

interface Point {
  x: number
  y: number
}

interface SnakeState {
  snake: Point[]
  dir: Point
  queue: Point[]
  food: Point
  eaten: number
  alive: boolean
  acc: number
}

function randomFood(snake: Point[]): Point {
  while (true) {
    const p = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    }
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export default function SnakeGame({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [score, setScore] = useState(0)
  const [length, setLength] = useState(3)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef(status)
  statusRef.current = status
  const scoreRef = useRef(0)
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  const stateRef = useRef<SnakeState | null>(null)

  const reset = useCallback(() => {
    const mid = Math.floor(GRID / 2)
    const snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ]
    stateRef.current = {
      snake,
      dir: { x: 1, y: 0 },
      queue: [],
      food: randomFood(snake),
      eaten: 0,
      alive: true,
      acc: 0,
    }
    scoreRef.current = 0
    setScore(0)
    setLength(3)
  }, [])

  const start = useCallback(() => {
    reset()
    setStatus('running')
  }, [reset])

  const restart = start

  const togglePause = useCallback(() => {
    if (statusRef.current === 'running') setStatus('paused')
    else if (statusRef.current === 'paused') setStatus('running')
  }, [])

  const pushDir = useCallback((dx: number, dy: number) => {
    const st = stateRef.current
    if (!st || !st.alive || statusRef.current !== 'running') return
    const last = st.queue.length > 0 ? st.queue[st.queue.length - 1] : st.dir
    // 与当前方向相同或相反则忽略
    if ((last.x === dx && last.y === dy) || (last.x === -dx && last.y === -dy))
      return
    if (st.queue.length < 3) st.queue.push({ x: dx, y: dy })
  }, [])

  useGameKeys({
    arrowup: () => pushDir(0, -1),
    w: () => pushDir(0, -1),
    arrowdown: () => pushDir(0, 1),
    s: () => pushDir(0, 1),
    arrowleft: () => pushDir(-1, 0),
    a: () => pushDir(-1, 0),
    arrowright: () => pushDir(1, 0),
    d: () => pushDir(1, 0),
    p: togglePause,
  })

  // ---------- 滑动手势 ----------
  // 在棋盘上滑动即可转向；滑过一格阈值后重置原点，
  // 因此不抬手也能连续改向，比方向键更跟手。
  const swipeOrigin = useRef<{ x: number; y: number } | null>(null)
  const SWIPE_STEP = 20

  const onTouchStart = (e: React.TouchEvent) => {
    if (statusRef.current !== 'running') return
    const t = e.touches[0]
    swipeOrigin.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const origin = swipeOrigin.current
    if (!origin || statusRef.current !== 'running') return
    const t = e.touches[0]
    const dx = t.clientX - origin.x
    const dy = t.clientY - origin.y
    if (Math.abs(dx) < SWIPE_STEP && Math.abs(dy) < SWIPE_STEP) return
    if (Math.abs(dx) > Math.abs(dy)) pushDir(dx > 0 ? 1 : -1, 0)
    else pushDir(0, dy > 0 ? 1 : -1)
    swipeOrigin.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = () => {
    swipeOrigin.current = null
  }

  const tick = useCallback(() => {
    const st = stateRef.current
    if (!st) return
    if (st.queue.length > 0) st.dir = st.queue.shift()!

    const head = st.snake[0]
    const next: Point = { x: head.x + st.dir.x, y: head.y + st.dir.y }

    const hitWall =
      next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID
    const hitSelf = st.snake.some(
      (s, i) => i < st.snake.length - 1 && s.x === next.x && s.y === next.y,
    )

    if (hitWall || hitSelf) {
      st.alive = false
      setStatus('over')
      gameOverRef.current(scoreRef.current)
      return
    }

    st.snake.unshift(next)
    if (next.x === st.food.x && next.y === st.food.y) {
      st.eaten += 1
      scoreRef.current = st.eaten * 10
      setScore(scoreRef.current)
      setLength(st.snake.length)
      st.food = randomFood(st.snake)
    } else {
      st.snake.pop()
    }
  }, [])

  // 主循环
  useEffect(() => {
    if (status !== 'running') return
    let raf = 0
    let last = performance.now()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const draw = (ts: number) => {
      const st = stateRef.current
      if (!st) return
      ctx.fillStyle = '#070912'
      ctx.fillRect(0, 0, SIZE, SIZE)

      ctx.strokeStyle = 'rgba(255,255,255,0.035)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 1; i < GRID; i++) {
        ctx.moveTo(i * CELL, 0)
        ctx.lineTo(i * CELL, SIZE)
        ctx.moveTo(0, i * CELL)
        ctx.lineTo(SIZE, i * CELL)
      }
      ctx.stroke()

      // 食物（脉动光点）
      const pulse = Math.sin(ts / 180) * 1.4
      ctx.fillStyle = '#ff5ca8'
      ctx.shadowColor = '#ff5ca8'
      ctx.shadowBlur = 16
      ctx.beginPath()
      ctx.arc(
        st.food.x * CELL + CELL / 2,
        st.food.y * CELL + CELL / 2,
        CELL / 2 - 5 + pulse * 0.5,
        0,
        Math.PI * 2,
      )
      ctx.fill()
      ctx.shadowBlur = 0

      // 蛇身
      st.snake.forEach((seg, i) => {
        const t = st.snake.length > 1 ? i / (st.snake.length - 1) : 0
        ctx.fillStyle =
          i === 0 ? '#7ceeff' : `hsl(${168 + t * 90}, 78%, ${60 - t * 20}%)`
        roundedRect(ctx, seg.x * CELL + 1.5, seg.y * CELL + 1.5, CELL - 3, CELL - 3, 6)
        ctx.fill()
      })

      // 头部眼睛
      const head = st.snake[0]
      const hx = head.x * CELL + CELL / 2
      const hy = head.y * CELL + CELL / 2
      const ex = st.dir.y !== 0 ? 4 : 0
      const ey = st.dir.x !== 0 ? 4 : 0
      const fx = st.dir.x * 3
      const fy = st.dir.y * 3
      ctx.fillStyle = '#0b0e1a'
      ctx.beginPath()
      ctx.arc(hx + fx - ex, hy + fy - ey, 1.8, 0, Math.PI * 2)
      ctx.arc(hx + fx + ex, hy + fy + ey, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }

    const loop = (ts: number) => {
      const st = stateRef.current
      if (!st || !st.alive) return
      raf = requestAnimationFrame(loop)
      const dt = Math.min(ts - last, 250)
      last = ts
      st.acc += dt
      const interval = Math.max(MIN_INTERVAL, BASE_INTERVAL - st.eaten * 4)
      while (st.acc >= interval && st.alive) {
        st.acc -= interval
        tick()
      }
      draw(ts)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [status, tick])

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>得分</span>
          <span className={shared.hudValue}>{score}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>长度</span>
          <span className={shared.hudValue}>{length}</span>
        </div>
      </div>

      <div
        className={shared.stage}
        style={{ maxWidth: `min(${SIZE}px, 100%)`, aspectRatio: '1 / 1' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <canvas
          ref={canvasRef}
          width={SIZE * 2}
          height={SIZE * 2}
          className={styles.canvas}
        />
        <GameOverlay
          status={status}
          score={score}
          onStart={start}
          onResume={() => setStatus('running')}
          onRestart={restart}
          idleHint="滑动屏幕或按方向键 / WASD 控制移动，吃掉光点不断变长"
        />
      </div>

      <div className={shared.touchPad}>
        {(
          [
            ['up', 0, -1, '↑'],
            ['left', -1, 0, '←'],
            ['down', 0, 1, '↓'],
            ['right', 1, 0, '→'],
          ] as const
        ).map(([dir, dx, dy, icon]) => (
          <button
            key={dir}
            type="button"
            className={shared.touchBtn}
            data-dir={dir}
            onClick={() => pushDir(dx, dy)}
            aria-label={`向${icon}移动`}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
}
