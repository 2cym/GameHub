import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { FAVORITE_CATEGORIES, type FavoriteCategory } from '../lib/api'
import type { GameMeta } from '../games/registry'
import { useAuth } from '../stores/auth'
import styles from './GameCard.module.css'

interface GameCardProps {
  game: GameMeta
  best: number
  index?: number
}

export function GameCard({ game, best, index = 0 }: GameCardProps) {
  const { user, isFavorite, favoriteCategory, toggleFavorite, setFavoriteCategory } = useAuth()
  const isFav = isFavorite(game.id)
  const category = favoriteCategory(game.id)

  // 卡片整块是可点链接，卡片内的按钮必须拦下默认行为，否则点一下就跳进游戏
  const stopNav = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleFav = (e: MouseEvent<HTMLElement>) => {
    stopNav(e)
    toggleFavorite(game.id).catch(() => {
      /* toggleFavorite 未登录时会打开登录弹窗，其余错误静默 */
    })
  }

  const handleCategory = (e: MouseEvent<HTMLElement>, cat: FavoriteCategory) => {
    stopNav(e)
    setFavoriteCategory(game.id, cat).catch(() => {
      /* 失败时 store 已回滚到原分类 */
    })
  }

  return (
    <Link
      to={`/game/${game.id}`}
      className={styles.card}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={styles.cover} style={{ background: game.gradient }}>
        <span className={styles.coverEmoji}>{game.emoji}</span>
        <span className={styles.category}>{game.category}</span>
        <button
          type="button"
          className={`${styles.favBtn} ${isFav ? styles.favOn : ''}`}
          title={user ? (isFav ? '取消收藏' : '收藏到「常玩」') : '登录后收藏'}
          aria-label={isFav ? '取消收藏' : '收藏'}
          aria-pressed={isFav}
          onClick={handleFav}
        >
          {isFav ? '★' : '☆'}
        </button>
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{game.name}</h3>
        <p className={styles.desc}>{game.description}</p>
        {isFav && user && (
          <div className={styles.catRow} role="group" aria-label="收藏分类">
            {FAVORITE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`${styles.catBtn} ${cat === category ? styles.catOn : ''}`}
                aria-pressed={cat === category}
                onClick={(e) => handleCategory(e, cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
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
