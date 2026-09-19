import { Link } from 'react-router-dom'
import type { GameMeta } from '../games/registry'
import { useAuth } from '../stores/auth'
import styles from './GameCard.module.css'

interface GameCardProps {
  game: GameMeta
  best: number
  index?: number
}

export function GameCard({ game, best, index = 0 }: GameCardProps) {
  const { user, favorites, toggleFavorite } = useAuth()
  const isFav = favorites.includes(game.id)

  const handleFav = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await toggleFavorite(game.id)
    } catch {
      /* toggleFavorite 未登录时会打开弹窗，其余错误静默 */
    }
  }

  return (
    <Link
      to={`/game/${game.id}`}
      className={styles.card}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={styles.cover} style={{ background: game.gradient }}>
        <span className={styles.coverEmoji}>{game.emoji}</span>
        <span className={`${styles.category} ${isFav ? '' : ''}`}>
          {game.category}
        </span>
        <button
          type="button"
          className={`${styles.favBtn} ${isFav ? styles.favOn : ''}`}
          title={user ? (isFav ? '取消收藏' : '收藏') : '登录后收藏'}
          aria-label={isFav ? '取消收藏' : '收藏'}
          onClick={handleFav}
        >
          {isFav ? '★' : '☆'}
        </button>
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{game.name}</h3>
        <p className={styles.desc}>{game.description}</p>
        <div className={styles.footer}>
          <span className={styles.best}>
            {best > 0 ? (
              <>
                最高 <b>{best}</b>
              </>
            ) : (
              '暂无纪录'
            )}
          </span>
          <span className={styles.play}>开始 →</span>
        </div>
      </div>
    </Link>
  )
}
