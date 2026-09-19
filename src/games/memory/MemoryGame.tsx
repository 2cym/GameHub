import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import shared from '../shared/game.module.css'
import styles from './Memory.module.css'

const FACES = ['🎮', '🚀', '👾', '🎲', '🏆', '⚡', '🌈', '🍕']
const PAIRS = FACES.length

interface Card {
  id: number
  face: string
  flipped: boolean
  matched: boolean
}

function shuffled(): Card[] {
  const cards: Card[] = [...FACES, ...FACES].map((face, i) => ({
    id: i,
    face,
    flipped: false,
    matched: false,
  }))
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

export default function MemoryGame({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [cards, setCards] = useState<Card[]>(shuffled)
  const [steps, setSteps] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const statusRef = useRef(status)
  statusRef.current = status
  const elapsedRef = useRef(0)
  const stepsRef = useRef(0)
  const lockRef = useRef(false)
  const firstPickRef = useRef<number | null>(null)
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver

  useEffect(() => {
    if (status !== 'running') return
    const id = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => window.clearInterval(id)
  }, [status])

  const start = useCallback(() => {
    setCards(shuffled())
    setSteps(0)
    setElapsed(0)
    elapsedRef.current = 0
    stepsRef.current = 0
    lockRef.current = false
    firstPickRef.current = null
    setStatus('running')
  }, [])

  const flip = useCallback(
    (index: number) => {
      if (statusRef.current !== 'running') return
      if (lockRef.current) return
      const card = cards[index]
      if (card.flipped || card.matched) return

      const next = cards.map((c, i) =>
        i === index ? { ...c, flipped: true } : c,
      )
      setCards(next)

      const first = firstPickRef.current
      if (first === null) {
        firstPickRef.current = index
        return
      }

      // 第二张：步数 +1
      stepsRef.current += 1
      setSteps(stepsRef.current)
      firstPickRef.current = null

      if (next[first].face === next[index].face) {
        // 配对成功
        const matched = next.map((c, i) =>
          i === first || i === index ? { ...c, matched: true } : c,
        )
        setCards(matched)
        if (matched.every((c) => c.matched)) {
          // 全部配对：计分（步数越少、用时越短分越高）
          const score = Math.max(
            50,
            PAIRS * 120 - stepsRef.current * 12 - elapsedRef.current * 2,
          )
          setStatus('over')
          gameOverRef.current(score)
        }
      } else {
        // 配对失败：短暂展示后翻回
        lockRef.current = true
        window.setTimeout(() => {
          setCards((cur) =>
            cur.map((c, i) =>
              i === first || i === index ? { ...c, flipped: false } : c,
            ),
          )
          lockRef.current = false
        }, 620)
      }
    },
    [cards],
  )

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>步数</span>
          <span className={shared.hudValue}>{steps}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>用时</span>
          <span className={shared.hudValue}>{elapsed}s</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>已配对</span>
          <span className={shared.hudValue}>
            {cards.filter((c) => c.matched).length / 2}/{PAIRS}
          </span>
        </div>
      </div>

      <div className={shared.stage}>
        <div className={styles.grid}>
          {cards.map((card, i) => (
            <button
              key={card.id}
              type="button"
              className={`${styles.card} ${
                card.flipped || card.matched ? styles.flipped : ''
              } ${card.matched ? styles.matched : ''}`}
              onClick={() => flip(i)}
              disabled={status === 'over'}
              aria-label={card.flipped || card.matched ? card.face : '未翻开的卡片'}
            >
              <span className={styles.inner}>
                <span className={styles.faceBack}>?</span>
                <span className={styles.faceFront}>{card.face}</span>
              </span>
            </button>
          ))}
        </div>

        <GameOverlay
          status={status}
          score={
            status === 'over'
              ? Math.max(50, PAIRS * 120 - steps * 12 - elapsed * 2)
              : 0
          }
          onStart={start}
          onResume={() => setStatus('running')}
          onRestart={start}
          idleHint="点击卡片翻开，找出全部 8 对图案。步数越少得分越高！"
        />
      </div>
    </div>
  )
}
