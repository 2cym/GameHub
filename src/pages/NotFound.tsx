import { Link } from 'react-router-dom'
import styles from './NotFound.module.css'

export function NotFoundPage() {
  return (
    <main className={`container ${styles.page}`}>
      <h1 className={styles.code}>404</h1>
      <p>页面飘出了游戏机之外…</p>
      <Link to="/" className="btn btn-primary">
        返回首页
      </Link>
    </main>
  )
}
