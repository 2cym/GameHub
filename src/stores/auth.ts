import { create } from 'zustand'
import { api, ApiError } from '../lib/api'
import type { User } from '../lib/types'

export type AuthModalMode = 'login' | 'register' | 'reset' | null

interface AuthState {
  user: User | null
  /** loading：应用启动时正在确认登录态 */
  status: 'loading' | 'guest' | 'authed'
  favorites: string[]
  modalMode: AuthModalMode
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string, code: string) => Promise<void>
  logout: () => Promise<void>
  refreshFavorites: () => Promise<void>
  toggleFavorite: (gameId: string) => Promise<void>
  isFavorite: (gameId: string) => boolean
  openAuth: (mode: Exclude<AuthModalMode, null>) => void
  closeAuth: () => void
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  favorites: [],
  modalMode: null,

  init: async () => {
    try {
      const { user } = await api.me()
      if (user) {
        set({ user, status: 'authed' })
        get().refreshFavorites().catch(() => {})
      } else {
        set({ status: 'guest' })
      }
    } catch {
      set({ status: 'guest' })
    }
  },

  login: async (email, password) => {
    await api.login(email, password)
    const { user } = await api.me()
    if (!user) throw new ApiError('登录态获取失败，请重试', 500)
    set({ user, status: 'authed', modalMode: null })
    get().refreshFavorites().catch(() => {})
  },

  register: async (email, username, password, code) => {
    await api.register(email, username, password, code)
    const { user } = await api.me()
    if (!user) throw new ApiError('登录态获取失败，请重试', 500)
    set({ user, status: 'authed', modalMode: null })
    get().refreshFavorites().catch(() => {})
  },

  logout: async () => {
    await api.logout()
    set({ user: null, status: 'guest', favorites: [] })
  },

  refreshFavorites: async () => {
    const { gameIds } = await api.myFavorites()
    set({ favorites: gameIds })
  },

  toggleFavorite: async (gameId) => {
    if (!get().user) {
      get().openAuth('login')
      return
    }
    const isFav = get().favorites.includes(gameId)
    // 乐观更新
    set({
      favorites: isFav
        ? get().favorites.filter((g) => g !== gameId)
        : [...get().favorites, gameId],
    })
    try {
      if (isFav) await api.removeFavorite(gameId)
      else await api.addFavorite(gameId)
    } catch {
      // 回滚
      set({
        favorites: isFav
          ? [...get().favorites, gameId]
          : get().favorites.filter((g) => g !== gameId),
      })
      throw new ApiError('收藏操作失败，请重试', 500)
    }
  },

  isFavorite: (gameId) => get().favorites.includes(gameId),

  openAuth: (mode) => set({ modalMode: mode }),
  closeAuth: () => set({ modalMode: null }),
}))
