import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AuthModal } from './components/AuthModal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Navbar } from './components/Navbar'
import { ToastHost } from './components/ToastHost'
import { AdminPage } from './pages/AdminPage'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/Home'
import { FriendsPage } from './pages/FriendsPage'
import { MatchPage } from './pages/MatchPage'
import { NotFoundPage } from './pages/NotFound'
import { ProfilePage } from './pages/Profile'
import { useAuth } from './stores/auth'
import { api } from './lib/api'

export default function App() {
  const init = useAuth((s) => s.init)
  const { pathname } = useLocation()

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    api.trackView(pathname).catch(() => {})
  }, [pathname])

  return (
    <>
      <Navbar />
      {/* key 让切换页面时重置错误边界，一页出错不影响其他页 */}
      <ErrorBoundary key={pathname}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/match/:roomId" element={<MatchPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
      <ToastHost />
      <AuthModal />
    </>
  )
}
