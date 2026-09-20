import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './Navbar.module.css'

export function Navbar() {
  const { user, status, logout, openAuth } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      toast('已退出登录', 'info')
      navigate('/')
    } catch {
      toast('退出失败，请重试', 'error')
    }
  }

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoIcon}>🎮</span>
          <span className={styles.logoText}>
            Game<em>Hub</em>
          </span>
        </Link>

        <nav className={styles.nav}>
          <NavLink to="/" end className={styles.navLink}>
            首页
          </NavLink>
          {status === 'authed' && (
            <NavLink
              to="/profile"
              className={`${styles.navLink} ${styles.navLinkSecondary}`}
            >
              个人中心
            </NavLink>
          )}
          {user?.isAdmin && (
            <NavLink to="/admin" className={styles.navLink}>
              管理后台
            </NavLink>
          )}
        </nav>

        <div className={styles.actions}>
          {status === 'authed' && user ? (
            <>
              <Link to="/profile" className={styles.userChip}>
                <span className={styles.avatar}>
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
                <span className={styles.username}>{user.username}</span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleLogout}
              >
                退出
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openAuth('login')}
            >
              登录 / 注册
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
