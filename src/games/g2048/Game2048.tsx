import { useCallback, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import shared from '../shared/game.module.css'
import styles from './2048.module.css'
import { useGameKeys } from '../shared/useGameKeys'
import { toast } from '../../stores/toast'

const N = 4

interface Tile {
  id: number
  x: number
  y: number
  v: number
  merged: boolean
  isNew: boolean
}

type Dir = { x: number; y: number }
const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
} as const

let nextId = 1

function spawn(tiles: Tile[], count = 1): Tile[] {
  const result = [...tiles]
  for (let i = 0; i < count; i++) {
    const empty: Array<[number, number]> = []
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (!result.some((t) => t.x === x && t.y === y)) empty.push([x, y])
    if (empty.length === 0) break
    const [x, y] = empty[Math.floor(Math.random() * empty.length)]
    result.push({
      id: nextId++,
      x,
      y,
      v: Math.random() < 0.9 ? 2 : 4,
      merged: false,
      isNew: true,
    })
  }
  return result
}

function canMove(tiles: Tile[]): boolean {
  if (tiles.length < N * N) return true
  for (const t of tiles) {
    for (const d of Object.values(DIRS)) {
      const other = tiles.find((o) => o.x === t.x + d.x && o.y === t.y + d.y)
      if (other && other.v === t.v) return true
    }
  }
  return false
}

function moveTiles(
  tiles: Tile[],
  dir: Dir,
): { tiles: Tile[]; moved: boolean; gained: number } {
  const grid: Array<Array<Tile | null>> = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => null),
  )
  const clones = tiles.map((t) => ({ ...t, merged: false, isNew: false }))
  for (const t of clones) grid[t.y][t.x] = t

  const xs = dir.x === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3]
  const ys = dir.y === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3]
  let moved = false
  let gained = 0
  const removed = new Set<number>()

  for (const y of ys) {
    for (const x of xs) {
      const t = grid[y][x]
      if (!t) continue
      let nx = x
      let ny = y
      let mergedInto = false
      while (true) {
        const tx = nx + dir.x
        const ty = ny + dir.y
        if (tx < 0 || tx > N - 1 || ty < 0 || ty > N - 1) break
        const other = grid[ty][tx]
        if (!other) {
          nx = tx
          ny = ty
          continue
        }
        if (other.v === t.v && !other.merged) {
          grid[ny][nx] = null
          removed.add(t.id)
          other.v *= 2
          other.merged = true
          gained += other.v
          moved = true
          mergedInto = true
        }
        break
      }
      if (!mergedInto && (nx !== x || ny !== y)) {
        grid[y][x] = null
        grid[ny][nx] = t
        t.x = nx
        t.y = ny
        moved = true
      }
    }
  }

  const result = clones.filter((t) => !removed.has(t.id))
  return { tiles: result, moved, gained }
}

const TILE_STYLES: Record<number, string> = {
  2: '#eee4da',
  4: '#ede0c8',
  8: '#f2b179',
  16: '#f59563',
  32: '#f67c5f',
  64: '#f65e3b',
  128: '#edcf72',
  256: '#edcc61',
  512: '#edc850',
  1024: '#edc53f',
  2048: '#edc22e',
}

export default function Game2048({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [tiles, setTiles] = useState<Tile[]>([])
  const [score, setScore] = useState(0)
  const [maxTile, setMaxTile] = useState(2)

  const statusRef = useRef(status)
  statusRef.current = status
  const scoreRef = useRef(0)
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver

  const start = useCallback(() => {
    setTiles(spawn([], 2))
    setScore(0)
    setMaxTile(2)
    scoreRef.current = 0
    setStatus('running')
  }, [])

  const togglePause = useCallback(() => {
    if (statusRef.current === 'running') setStatus('paused')
    else if (statusRef.current === 'paused') setStatus('running')
  }, [])

  const handleMove = useCallback(
    (dir: Dir) => {
      if (statusRef.current !== 'running') return
      const { tiles: next, moved, gained } = moveTiles(tiles, dir)
      if (!moved) return

      scoreRef.current += gained
      setScore(scoreRef.current)

      const prevMax = tiles.reduce((m, t) => Math.max(m, t.v), 0)
      const max = next.reduce((m, t) => Math.max(m, t.v), 0)
      setMaxTile(max)
      if (max >= 2048 && prevMax < 2048) {
        toast('🎯 达成 2048！继续冲击更高分', 'success')
      }

      const withNew = spawn(next)
      setTiles(withNew)

      if (!canMove(withNew)) {
        setStatus('over')
        gameOverRef.current(scoreRef.current)
      }
    },
    [tiles],
  )

  useGameKeys({
    arrowup: () => handleMove(DIRS.up),
    w: () => handleMove(DIRS.up),
    arrowdown: () => handleMove(DIRS.down),
    s: () => handleMove(DIRS.down),
    arrowleft: () => handleMove(DIRS.left),
    a: () => handleMove(DIRS.left),
    arrowright: () => handleMove(DIRS.right),
    d: () => handleMove(DIRS.right),
    p: togglePause,
  })

  // 触控滑动
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current
    if (!s) return
    touchStart.current = null
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    if (Math.abs(dx) > Math.abs(dy))
      handleMove(dx > 0 ? DIRS.right : DIRS.left)
    else handleMove(dy > 0 ? DIRS.down : DIRS.up)
  }

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>得分</span>
          <span className={shared.hudValue}>{score}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>最大方块</span>
          <span className={shared.hudValue}>{maxTile}</span>
        </div>
      </div>

      <div
        className={`${shared.stage} ${styles.stagePad}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className={styles.board}>
          <div className={styles.bg}>
            {Array.from({ length: N * N }, (_, i) => (
              <span key={i} />
            ))}
          </div>
          {tiles.map((t) => (
            <div
              key={t.id}
              className={`${styles.tile} ${t.isNew ? styles.new : ''} ${
                t.merged ? styles.merged : ''
              } ${t.v > 4 ? styles.white : ''} ${t.v >= 128 ? styles.glow : ''}`}
              style={
                {
                  '--x': t.x,
                  '--y': t.y,
                  background: TILE_STYLES[t.v] ?? '#3c3a32',
                } as React.CSSProperties
              }
            >
              {t.v}
            </div>
          ))}
        </div>

        <GameOverlay
          status={status}
          score={score}
          onStart={start}
          onResume={() => setStatus('running')}
          onRestart={start}
          idleHint="方向键 / WASD 或滑动屏幕，合并相同数字冲击 2048"
        />
      </div>
    </div>
  )
}
