import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { useGameKeys } from '../shared/useGameKeys'
import { toast } from '../../stores/toast'
import shared from '../shared/game.module.css'
import styles from './Sokoban.module.css'
import {
  hasDeadlock,
  isWin,
  parseLevel,
  step,
  LEVELS,
  type DirKey,
  type SokobanState,
} from './sokobanLogic'

/** 单关得分基数，随关卡递增；步数越少扣分越少。 */
function levelScore(levelIndex: number, moves: number, pushes: number): number {
  const base = 200 + levelIndex * 100
  const par = 40 + levelIndex * 20 // 参考步数
  const eff = Math.max(0, par * 2 - moves) // 步数越少效率越高
  return Math.max(50, base + eff * 2 - pushes)
}

export default function Sokoban({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [levelIdx, setLevelIdx] = useState(0)
  const [state, setState] = useState<SokobanState>(() => parseLevel(LEVELS[0]))
  const [history, setHistory] = useState<SokobanState[]>([])
  const [totalScore, setTotalScore] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [deadlock, setDeadlock] = useState(false)

  const statusRef = useRef(status)
  statusRef.current = status
  const stateRef = useRef(state)
  stateRef.current = state
  const levelRef = useRef(levelIdx)
  levelRef.current = levelIdx
  const totalRef = useRef(totalScore)
  totalRef.current = totalScore
  const completedRef = useRef(completed)
  completedRef.current = completed
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver

  const loadLevel = useCallback((idx: number) => {
    setState(parseLevel(LEVELS[idx]))
    setHistory([])
    setDeadlock(false)
    setLevelIdx(idx)
  }, [])

  const start = useCallback(() => {
    setTotalScore(0)
    setCompleted(0)
    totalRef.current = 0
    completedRef.current = 0
    loadLevel(0)
    setStatus('running')
  }, [loadLevel])

  const endGame = useCallback(() => {
    setStatus('over')
    gameOverRef.current(totalRef.current)
  }, [])

  const advance = useCallback(
    (moves: number, pushes: number) => {
      const gained = levelScore(levelRef.current, moves, pushes)
      const newTotal = totalRef.current + gained
      setTotalScore(newTotal)
      totalRef.current = newTotal
      const done = completedRef.current + 1
      setCompleted(done)
      completedRef.current = done
      toast(`过关！本关 +${gained} 分`, 'success')
      const nextIdx = levelRef.current + 1
      if (nextIdx >= LEVELS.length) {
        // 全部通关
        setStatus('over')
        gameOverRef.current(newTotal)
      } else {
        loadLevel(nextIdx)
      }
    },
    [loadLevel],
  )

  const doMove = useCallback(
    (dir: DirKey) => {
      if (statusRef.current !== 'running') return
      const next = step(stateRef.current, dir)
      if (!next) return
      setHistory((h) => [...h, stateRef.current])
      setState(next)
      setDeadlock(hasDeadlock(next))
      if (isWin(next)) {
        // 延迟一点让玩家看到最后一步
        setTimeout(() => advance(next.moves, next.pushes), 250)
      }
    },
    [advance],
  )

  const undo = useCallback(() => {
    if (statusRef.current !== 'running') return
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setState(prev)
      setDeadlock(hasDeadlock(prev))
      return h.slice(0, -1)
    })
  }, [])

  const reset = useCallback(() => {
    if (statusRef.current !== 'running') return
    loadLevel(levelRef.current)
  }, [loadLevel])

  useGameKeys({
    arrowup: () => doMove('up'),
    w: () => doMove('up'),
    arrowdown: () => doMove('down'),
    s: () => doMove('down'),
    arrowleft: () => doMove('left'),
    a: () => doMove('left'),
    arrowright: () => doMove('right'),
    d: () => doMove('right'),
    u: undo,
    r: reset,
  })

  useEffect(() => {
    // 死锁提示仅显示一次的状态徽标，不强制结束
  }, [deadlock])

  const { width, height, walls, goals, boxes, player, moves, pushes } = state
  const cells = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const isWall = walls.has(i)
      const isGoal = goals.has(i)
      const isBox = boxes.has(i)
      const isPlayer = player === i
      cells.push(
        <div
          key={i}
          className={[
            styles.cell,
            isWall ? styles.wall : '',
            isGoal ? styles.goal : '',
            isBox ? (isGoal ? styles.boxOnGoal : styles.box) : '',
            isPlayer ? styles.player : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isPlayer && <span className={styles.playerDot} />}
        </div>,
      )
    }
  }

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>关卡</span>
          <span className={shared.hudValue}>
            {levelIdx + 1}/{LEVELS.length}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>步数</span>
          <span className={shared.hudValue}>{moves}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>推箱</span>
          <span className={shared.hudValue}>{pushes}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>总分</span>
          <span className={shared.hudValue}>{totalScore}</span>
        </div>
      </div>

      <div className={`${shared.stage} ${styles.stagePad}`}>
        <div
          className={styles.board}
          style={
            {
              '--w': width,
              '--h': height,
            } as React.CSSProperties
          }
        >
          {cells}
        </div>

        {deadlock && status === 'running' && (
          <div className={styles.deadlockTip}>
            ⚠️ 箱子卡入死角，可撤销(U)或重置(R)
          </div>
        )}

        <div className={styles.controls}>
          <button
            type="button"
            className="btn"
            onClick={undo}
            disabled={history.length === 0}
          >
            ↩ 撤销 (U)
          </button>
          <button type="button" className="btn" onClick={reset}>
            🔁 重置 (R)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => loadLevel(Math.max(0, levelIdx - 1))}
            disabled={levelIdx === 0}
          >
            ‹ 上一关
          </button>
          <button
            type="button"
            className="btn"
            onClick={endGame}
            title="结束本局并结算成绩"
          >
            ⏹ 结算
          </button>
        </div>

        <GameOverlay
          status={status}
          score={totalScore}
          scoreLabel={completed >= LEVELS.length ? '全部通关！总分' : '本次总分'}
          onStart={start}
          onResume={() => setStatus('running')}
          onRestart={start}
          idleTitle="推箱子"
          idleHint={`共 ${LEVELS.length} 关。用方向键推动箱子到所有目标点，全部过关得高分`}
        />
      </div>

      <div className={shared.touchPad}>
        <button
          type="button"
          className={shared.touchBtn}
          data-dir="up"
          aria-label="上"
          onClick={() => doMove('up')}
        >
          ↑
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          data-dir="left"
          aria-label="左"
          onClick={() => doMove('left')}
        >
          ←
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          data-dir="down"
          aria-label="下"
          onClick={() => doMove('down')}
        >
          ↓
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          data-dir="right"
          aria-label="右"
          onClick={() => doMove('right')}
        >
          →
        </button>
      </div>
    </div>
  )
}
