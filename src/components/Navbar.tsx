import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Avatar } from './Avatar'
import { useTheme } from '../lib/theme'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './Navbar.module.css'

export function Navbar() {
  const { user, status, logout, openAuth } = useAuth()
  const { theme, toggle } = useTheme()
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
          {status === 'authed' && (
            <NavLink to="/stats" className={styles.navLink}>
              我的数据
            </NavLink>
          )}
          {status === 'authed' && (
            <NavLink
              to="/friends"
              className={styles.navLink}
            >
              好友对战
            </NavLink>
          )}
          {user?.isAdmin && (
            <NavLink to="/admin" className={styles.navLink}>
              管理后台
            </NavLink>
          )}
        </nav>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.themeBtn}
            onClick={toggle}
            aria-label={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
            title={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {status === 'authed' && user ? (
            <>
              <Link to="/profile" className={styles.userChip}>
                <Avatar
                  emoji={user.avatarEmoji}
                  color={user.avatarColor}
                  fallback={user.username}
                  size={30}
                />
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
