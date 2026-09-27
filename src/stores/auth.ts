import { create } from 'zustand'
import { api, ApiError, type FavoriteCategory } from '../lib/api'
import type { User } from '../lib/types'

export type AuthModalMode = 'login' | 'register' | 'reset' | null

/** gameId → 分类。缺分类的旧收藏按「常玩」处理 */
type Favorites = Record<string, FavoriteCategory>

interface AuthState {
  user: User | null
  /** loading：应用启动时正在确认登录态 */
  status: 'loading' | 'guest' | 'authed'
  favorites: Favorites
  modalMode: AuthModalMode
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string, code: string) => Promise<void>
  logout: () => Promise<void>
  refreshFavorites: () => Promise<void>
  toggleFavorite: (gameId: string, category?: FavoriteCategory) => Promise<void>
  setFavoriteCategory: (gameId: string, category: FavoriteCategory) => Promise<void>
  isFavorite: (gameId: string) => boolean
  favoriteCategory: (gameId: string) => FavoriteCategory
  updateAvatar: (patch: { avatarEmoji?: string; avatarColor?: number }) => Promise<void>
  openAuth: (mode: Exclude<AuthModalMode, null>) => void
  closeAuth: () => void
}

/** 后端 entries 是主数据，gameIds 只在旧响应形状里兜底，两边都要能读 */
function toFavoritesMap(entries: { gameId: string; category: FavoriteCategory }[], fallback: string[]): Favorites {
  const map: Favorites = {}
  for (const e of entries) map[e.gameId] = e.category
  for (const id of fallback) map[id] ??= '常玩'
  return map
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  favorites: {},
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
    set({ user: null, status: 'guest', favorites: {} })
  },

  refreshFavorites: async () => {
    const data = await api.myFavorites()
    set({ favorites: toFavoritesMap(data.entries ?? [], data.gameIds ?? []) })
  },

  toggleFavorite: async (gameId, category = '常玩') => {
    if (!get().user) {
      get().openAuth('login')
      return
    }
    const prev = get().favorites
    const isFav = gameId in prev
    // 乐观更新
    const next = isFav
      ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== gameId))
      : { ...prev, [gameId]: category }
    set({ favorites: next })
    try {
      if (isFav) await api.removeFavorite(gameId)
      else await api.addFavorite(gameId, category)
    } catch {
      // 回滚到调用前的快照
      set({ favorites: prev })
      throw new ApiError('收藏操作失败，请重试', 500)
    }
  },

  setFavoriteCategory: async (gameId, category) => {
    if (!get().user || !(gameId in get().favorites)) return
    if (get().favorites[gameId] === category) return
    const prev = get().favorites
    set({ favorites: { ...prev, [gameId]: category } })
    try {
      await api.setFavoriteCategory(gameId, category)
    } catch {
      set({ favorites: prev })
      throw new ApiError('分类更新失败，请重试', 500)
    }
  },

  isFavorite: (gameId) => gameId in get().favorites,
  favoriteCategory: (gameId) => get().favorites[gameId] ?? '常玩',

  updateAvatar: async (patch) => {
    const me = get().user
    if (!me) return
    const prev = me
    try {
      const r = await api.updateProfile(patch)
      // 直接回填响应里的权威值，不用额外请求一次 /api/auth/me
      set({
        user: { ...prev, avatarEmoji: r.avatarEmoji, avatarColor: Number(r.avatarColor) },
      })
    } catch {
      set({ user: prev })
      throw new ApiError('头像更新失败，请重试', 500)
    }
  },

  openAuth: (mode) => set({ modalMode: mode }),
  closeAuth: () => set({ modalMode: null }),
}))
