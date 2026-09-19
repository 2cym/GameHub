import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import shared from '../shared/game.module.css'
import styles from './WhackAMole.module.css'

const DURATION = 30 // 秒
const HOLES = 9

interface MoleState {
  hole: number
  kind: 'normal' | 'gold'
  until: number // 消失时间戳
}

export default function WhackAMole({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(DURATION)
  const [moles, setMoles] = useState<MoleState[]>([])
  const [bonks, setBonks] = useState<Array<{ id: number; hole: number; kind: string }>>([])

  const statusRef = useRef(status)
  statusRef.current = status
  const scoreRef = useRef(0)
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  const bonkIdRef = useRef(1)

  const endGame = useCallback(() => {
    setStatus('over')
    setMoles([])
    gameOverRef.current(scoreRef.current)
  }, [])

  const start = useCallback(() => {
    scoreRef.current = 0
    setScore(0)
    setTimeLeft(DURATION)
    setMoles([])
    setBonks([])
    setStatus('running')
  }, [])

  // 倒计时
  useEffect(() => {
    if (status !== 'running') return
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(id)
          endGame()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [status, endGame])

  // 地鼠生成与过期清理
  useEffect(() => {
    if (status !== 'running') return
    let spawnTimer = 0
    let cleanupTimer = 0

    const tick = () => {
      const now = Date.now()
      setMoles((cur) => {
        const alive = cur.filter((m) => m.until > now)
        // 随机在空洞生成一只（速度快时可能同时 2 只）
        if (alive.length < 2 && Math.random() < 0.75) {
          const busy = new Set(alive.map((m) => m.hole))
          const free = Array.from({ length: HOLES }, (_, i) => i).filter(
            (h) => !busy.has(h),
          )
          if (free.length > 0) {
            const hole = free[Math.floor(Math.random() * free.length)]
            const kind: MoleState['kind'] = Math.random() < 0.18 ? 'gold' : 'normal'
            // 手机端点按需要反应时间，停留窗口比桌面稍宽一些，避免"看得见点不到"
            const mobile =
              typeof window !== 'undefined' &&
              (window.matchMedia('(any-pointer: coarse)').matches ||
                window.innerWidth <= 768)
            const stay =
              kind === 'gold'
                ? (mobile ? 780 : 620) + Math.random() * (mobile ? 460 : 380)
                : (mobile ? 1050 : 850) + Math.random() * (mobile ? 1000 : 900)
            alive.push({ hole, kind, until: now + stay })
          }
        }
        return alive
      })
      // 随难度加快刷新（700–400ms）
      const speed = Math.max(
        400,
        700 - (DURATION - timeLeftRef.current) * 10,
      )
      spawnTimer = window.setTimeout(tick, speed)
    }

    const cleanup = () => {
      const now = Date.now()
      setMoles((cur) => cur.filter((m) => m.until > now))
      cleanupTimer = window.setTimeout(cleanup, 200)
    }

    spawnTimer = window.setTimeout(tick, 400)
    cleanupTimer = window.setTimeout(cleanup, 200)
    return () => {
      window.clearTimeout(spawnTimer)
      window.clearTimeout(cleanupTimer)
    }
  }, [status])

  // timeLeft 需要在生成器里读取（难度曲线），用 ref 同步
  const timeLeftRef = useRef(DURATION)
  timeLeftRef.current = timeLeft

  const whack = useCallback(
    (mole: MoleState) => {
      if (statusRef.current !== 'running') return
      const now = Date.now()
      if (mole.until <= now) return
      const gained = mole.kind === 'gold' ? 30 : 10
      scoreRef.current += gained
      setScore(scoreRef.current)
      // 立即移除并播放命中特效
      setMoles((cur) => cur.filter((m) => m !== mole))
      const bonk = { id: bonkIdRef.current++, hole: mole.hole, kind: mole.kind }
      setBonks((cur) => [...cur, bonk])
      window.setTimeout(
        () => setBonks((cur) => cur.filter((b) => b.id !== bonk.id)),
        480,
      )
    },
    [],
  )

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>得分</span>
          <span className={shared.hudValue}>{score}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>剩余时间</span>
          <span
            className={shared.hudValue}
            style={{ color: timeLeft <= 5 ? 'var(--danger)' : undefined }}
          >
            {timeLeft}s
          </span>
        </div>
      </div>

      <div className={`${shared.stage} ${styles.moleStage}`}>
        <div className={styles.field}>
          {Array.from({ length: HOLES }, (_, i) => {
            const mole = moles.find((m) => m.hole === i)
            const bonk = bonks.find((b) => b.hole === i)
            return (
              // 整个洞口都是点击目标（地鼠只是视觉层，pointer-events:none），
              // 这样点击区域从地鼠本体的 59px 放大到整个洞的 ~100px
              <button
                key={i}
                type="button"
                className={`${styles.hole} ${mole ? styles.holeActive : ''}`}
                onClick={() => mole && whack(mole)}
                aria-label={
                  mole
                    ? mole.kind === 'gold'
                      ? '金色地鼠，点击得分'
                      : '地鼠，点击得分'
                    : '空的地洞'
                }
              >
                <span className={styles.holeBg} />
                {mole && (
                  <span
                    className={`${styles.mole} ${
                      mole.kind === 'gold' ? styles.gold : ''
                    }`}
                  >
                    {mole.kind === 'gold' ? '🌟' : '🐹'}
                  </span>
                )}
                {bonk && (
                  <span className={styles.bonk}>
                    {bonk.kind === 'gold' ? '+30' : '+10'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <GameOverlay
          status={status}
          score={score}
          onStart={start}
          onResume={() => setStatus('running')}
          onRestart={start}
          idleHint="限时 30 秒！普通地鼠 +10，金色地鼠 +30，手速要快"
        />
      </div>
    </div>
  )
}
