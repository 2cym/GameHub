import type { GameStatus } from '../../lib/types'
import styles from './game.module.css'

interface GameOverlayProps {
  status: GameStatus
  score: number
  scoreLabel?: string
  onStart: () => void
  onResume: () => void
  onRestart: () => void
  idleTitle?: string
  idleHint?: string
}

/** 所有游戏共用的开始/暂停/结束覆盖层 */
export function GameOverlay({
  status,
  score,
  scoreLabel = '本局得分',
  onStart,
  onResume,
  onRestart,
  idleTitle = '准备好了吗？',
  idleHint,
}: GameOverlayProps) {
  if (status === 'running') return null

  return (
    <div className={styles.overlay}>
      {status === 'idle' && (
        <>
          <h3 className={styles.overlayTitle}>{idleTitle}</h3>
          {idleHint && <p className={styles.overlayHint}>{idleHint}</p>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={onStart}
            autoFocus
          >
            ▶ 开始游戏
          </button>
        </>
      )}

      {status === 'paused' && (
        <>
          <h3 className={styles.overlayTitle}>已暂停</h3>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onResume}
            autoFocus
          >
            ⏵ 继续游戏
          </button>
        </>
      )}

      {status === 'over' && (
        <>
          <h3 className={styles.overlayTitle}>游戏结束</h3>
          <p className={styles.overlayScore}>
            {scoreLabel} <strong>{score}</strong>
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRestart}
            autoFocus
          >
            🔄 再来一局
          </button>
        </>
      )}
    </div>
  )
}
