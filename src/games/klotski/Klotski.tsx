import { useCallback, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { toast } from '../../stores/toast'
import shared from '../shared/game.module.css'
import styles from './Klotski.module.css'
import {
  COLS,
  ROWS,
  isEscaped,
  slideRange,
  LAYOUTS,
  type Piece,
} from './klotskiLogic'

function clonePieces(pieces: Piece[]): Piece[] {
  return pieces.map((p) => ({ ...p }))
}

interface DragInfo {
  id: string
  startClientX: number
  startClientY: number
  cellW: number
  cellH: number
  range: { minX: number; maxX: number; minY: number; maxY: number }
  originX: number
  originY: number
  moved: boolean
}

export default function Klotski({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [layoutIdx, setLayoutIdx] = useState(0)
  const [pieces, setPieces] = useState<Piece[]>(() => clonePieces(LAYOUTS[0].pieces))
  const [moves, setMoves] = useState(0)
  const [totalScore, setScore] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [history, setHistory] = useState<Piece[][]>([])
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragInfo | null>(null)

  const statusRef = useRef(status)
  statusRef.current = status
  const piecesRef = useRef(pieces)
  piecesRef.current = pieces
  const movesRef = useRef(moves)
  movesRef.current = moves
  const layoutRef = useRef(layoutIdx)
  layoutRef.current = layoutIdx
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver

  const loadLayout = useCallback((idx: number) => {
    setPieces(clonePieces(LAYOUTS[idx].pieces))
    setHistory([])
    setMoves(0)
    setSelected(null)
    setLayoutIdx(idx)
    movesRef.current = 0
  }, [])

  const start = useCallback(() => {
    loadLayout(layoutRef.current)
    setStatus('running')
  }, [loadLayout])

  const finish = useCallback((moveCount: number) => {
    const layout = LAYOUTS[layoutRef.current]
    // 计分：基数 1000，超出参考步数按步扣分
    const over = Math.max(0, moveCount - layout.par)
    const final = Math.max(50, 1000 - over * 8)
    setScore(final)
    setStatus('over')
    gameOverRef.current(final)
  }, [])

  const applyMove = useCallback(
    (next: Piece[]) => {
      setPieces(next)
      const m = movesRef.current + 1
      setMoves(m)
      movesRef.current = m
      if (isEscaped(next)) {
        setTimeout(() => finish(m), 350)
      }
    },
    [finish],
  )

  const movePieceTo = useCallback(
    (id: string, nx: number, ny: number) => {
      setHistory((h) => [...h, clonePieces(piecesRef.current)])
      const next = piecesRef.current.map((p) =>
        p.id === id ? { ...p, x: nx, y: ny } : p,
      )
      applyMove(next)
    },
    [applyMove],
  )

  const undo = useCallback(() => {
    if (statusRef.current !== 'running') return
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setPieces(prev)
      movesRef.current = Math.max(0, movesRef.current - 1)
      setMoves(movesRef.current)
      return h.slice(0, -1)
    })
  }, [])

  const reset = useCallback(() => {
    if (statusRef.current !== 'running') return
    loadLayout(layoutRef.current)
  }, [loadLayout])

  // ---- 拖拽 ----
  const onPointerDown = (e: React.PointerEvent, piece: Piece) => {
    if (statusRef.current !== 'running') return
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const cellW = rect.width / COLS
    const cellH = rect.height / ROWS
    const range = slideRange(piece, piecesRef.current)
    dragRef.current = {
      id: piece.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      cellW,
      cellH,
      range,
      originX: piece.x,
      originY: piece.y,
      moved: false,
    }
    setSelected(piece.id)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || statusRef.current !== 'running') return
    const piece = piecesRef.current.find((p) => p.id === drag.id)
    if (!piece) return
    const dx = e.clientX - drag.startClientX
    const dy = e.clientY - drag.startClientY
    const stepX = Math.round(dx / drag.cellW)
    const stepY = Math.round(dy / drag.cellH)

    // 沿可动方向吸附：优先取位移更大的轴
    let nx = piece.x
    let ny = piece.y
    if (Math.abs(stepX) > Math.abs(stepY)) {
      nx = Math.min(drag.range.maxX, Math.max(drag.range.minX, drag.originX + stepX))
    } else {
      ny = Math.min(drag.range.maxY, Math.max(drag.range.minY, drag.originY + stepY))
    }
    if (nx !== piece.x || ny !== piece.y) {
      drag.moved = true
      setPieces((prev) =>
        prev.map((p) => (p.id === drag.id ? { ...p, x: nx, y: ny } : p)),
      )
    }
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (statusRef.current !== 'running') return
    if (!drag.moved) return
    const piece = piecesRef.current.find((p) => p.id === drag.id)
    if (!piece) return
    if (piece.x === drag.originX && piece.y === drag.originY) return
    // 落定：记一步并检查胜负
    setHistory((h) => [...h, clonePieces(piecesRef.current.map((p) => (p.id === drag.id ? { ...p, x: drag.originX, y: drag.originY } : p)))])
    const m = movesRef.current + 1
    setMoves(m)
    movesRef.current = m
    if (isEscaped(piecesRef.current)) {
      setTimeout(() => finish(m), 350)
    }
  }

  // 点击移动：选中后点击相邻可滑动方向的目标格
  const onCellClick = (cx: number, cy: number) => {
    if (statusRef.current !== 'running') return
    if (!selected) return
    const piece = piecesRef.current.find((p) => p.id === selected)
    if (!piece) return
    const range = slideRange(piece, piecesRef.current)
    // 允许水平或垂直滑动到包含该点击的位置
    if (
      cy >= piece.y &&
      cy < piece.y + piece.h &&
      cx >= range.minX &&
      cx <= range.maxX &&
      cx !== piece.x
    ) {
      const nx = Math.min(range.maxX, Math.max(range.minX, cx))
      if (nx !== piece.x) movePieceTo(piece.id, nx, piece.y)
    } else if (
      cx >= piece.x &&
      cx < piece.x + piece.w &&
      cy >= range.minY &&
      cy <= range.maxY &&
      cy !== piece.y
    ) {
      const ny = Math.min(range.maxY, Math.max(range.minY, cy))
      if (ny !== piece.y) movePieceTo(piece.id, piece.x, ny)
    }
  }

  const layout = LAYOUTS[layoutIdx]

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>布局</span>
          <span className={shared.hudValue}>{layout.name}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>步数</span>
          <span className={shared.hudValue}>{moves}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>参考</span>
          <span className={shared.hudValue}>{layout.par}</span>
        </div>
      </div>

      <div className={styles.layoutRow}>
        <div className={`${shared.stage} ${styles.stagePad}`}>
          <div
            ref={boardRef}
            className={styles.board}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ touchAction: 'none' }}
          >
            {/* 网格点击层 */}
            {Array.from({ length: COLS * ROWS }, (_, i) => {
              const cx = i % COLS
              const cy = Math.floor(i / COLS)
              return (
                <div
                  key={i}
                  className={styles.hitCell}
                  style={{ left: `${cx * 25}%`, top: `${cy * 20}%` }}
                  onClick={() => onCellClick(cx, cy)}
                />
              )
            })}
            {pieces.map((p) => (
              <div
                key={p.id}
                className={[
                  styles.piece,
                  p.target ? styles.target : '',
                  selected === p.id ? styles.pieceSel : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  left: `${p.x * 25}%`,
                  top: `${p.y * 20}%`,
                  width: `${p.w * 25}%`,
                  height: `${p.h * 20}%`,
                }}
                onPointerDown={(e) => onPointerDown(e, p)}
              >
                <span className={styles.pieceName}>{p.name}</span>
              </div>
            ))}
            {/* 出口指示 */}
            <div className={styles.exit} />
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              className="btn"
              onClick={undo}
              disabled={history.length === 0}
            >
              ↩ 撤销
            </button>
            <button type="button" className="btn" onClick={reset}>
              🔁 重置
            </button>
          </div>

          <GameOverlay
            status={status}
            score={totalScore}
            scoreLabel="本局得分"
            onStart={start}
            onResume={() => setStatus('running')}
            onRestart={start}
            idleTitle="华容道"
            idleHint="拖动（或点击）滑动方块，把曹操移到底部出口。步数越少得分越高"
          />
        </div>

        <div className={styles.sideCol}>
          <div className={styles.layoutList}>
            {LAYOUTS.map((l, i) => (
              <button
                key={l.name}
                type="button"
                className={`${styles.layoutChip} ${
                  i === layoutIdx ? styles.layoutOn : ''
                }`}
                onClick={() => {
                  loadLayout(i)
                  if (statusRef.current === 'running') toast(`已切换到「${l.name}」`, 'info')
                }}
              >
                {l.name}
                <span className={styles.layoutPar}>参考 {l.par} 步</span>
              </button>
            ))}
          </div>
          <p className={styles.tip}>
            目标：让红色的曹操从底部缺口移出。点击方块选中，再点相邻位置可快速滑动；也可直接拖拽。
          </p>
        </div>
      </div>
    </div>
  )
}
