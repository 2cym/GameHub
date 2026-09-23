import type { LeaderEntry, PersonalBest, ScoreRecord, User } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new ApiError('网络异常，请检查连接', 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `请求失败 (${res.status})`
    throw new ApiError(message, res.status)
  }
  return data as T
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

export type EmailCodePurpose = 'register' | 'reset'

// ---------- 管理员类型 ----------

export interface AdminUserRow {
  id: string
  email: string
  username: string
  isAdmin: boolean
  isBanned: boolean
  createdAt: number
  scoreCount: number
  favCount: number
}

export interface AdminUserDetail extends AdminUserRow {
  bests: { gameId: string; best: number }[]
  favorites: string[]
}

export interface AdminStats {
  totalUsers: number
  totalScores: number
  totalFavorites: number
  newUsers7d: number
  gameDistribution: { gameId: string; cnt: number }[]
  recentRegistrations: { username: string; email: string; createdAt: number; isAdmin: boolean }[]
}

export interface AdminDebug {
  db: string
  jwtSecret: string
  resendKey: string
  adminEmail: string
  mailFrom: string
  workerVersion: string
}

export interface AdminAnalytics {
  totalViews: number
  viewsToday: number
  viewsWeek: number
  pathDistribution: { path: string; cnt: number }[]
  hourlyTraffic: { hour: string; cnt: number }[]
}

// ---------- 留言板类型 ----------

export interface MessageRow {
  id: number
  username: string
  content: string
  createdAt: number
}

// ---------- 好友类型 ----------

export interface FriendUser {
  id: string
  username: string
  email: string
  isAdmin: boolean
  isBanned: boolean
}

export interface SearchResult {
  id: string
  username: string
  isBanned: boolean
}

// ---------- 对局类型 ----------

export interface GameRoom {
  id: string
  game_id: string
  host_id: string
  player_id: string | null
  host_color: string
  player_color: string
  board_state: string
  current_turn: string
  last_move: string | null
  status: 'waiting' | 'playing' | 'finished'
  moves_count: number
  createdAt: number
  updatedAt: number
  hostName: string | null
  playerName: string | null
}

export interface RoomSummary {
  id: string
  game_id: string
  host_id: string
  player_id: string | null
  host_color: string
  player_color: string
  status: string
  createdAt: number
  hostName: string | null
}

export interface MatchHistory {
  game_id: string
  opponent_id: string
  winner: string | null
  moves: number
  duration: number
  createdAt: number
  opponentName: string | null
}

// ---------- 用户 API ----------

export const api = {
  sendEmailCode: (email: string, purpose: EmailCodePurpose) =>
    post<{ ok: boolean }>('/api/auth/email-code', { email, purpose }),

  register: (email: string, username: string, password: string, code: string) =>
    post<{ user: User }>('/api/auth/register', {
      email,
      username,
      password,
      code,
    }),

  login: (email: string, password: string) =>
    post<{ user: User }>('/api/auth/login', { email, password }),

  resetPassword: (email: string, code: string, newPassword: string) =>
    post<{ ok: boolean }>('/api/auth/forgot-password', {
      email,
      code,
      newPassword,
    }),

  logout: () => post<{ ok: boolean }>('/api/auth/logout'),

  me: () => request<{ user: User | null }>('/api/auth/me'),

  leaderboard: (gameId: string) =>
    request<{ entries: LeaderEntry[] }>(
      `/api/leaderboard/${encodeURIComponent(gameId)}`,
    ),

  submitScore: (gameId: string, score: number) =>
    post<{ best: number }>('/api/scores', { gameId, score }),

  myBests: () => request<{ bests: PersonalBest[] }>('/api/me/scores'),

  myRecent: () => request<{ records: ScoreRecord[] }>('/api/me/scores/recent'),

  myFavorites: () => request<{ gameIds: string[] }>('/api/me/favorites'),

  addFavorite: (gameId: string) => post<{ ok: boolean }>('/api/me/favorites', { gameId }),

  removeFavorite: (gameId: string) =>
    request<unknown>(`/api/me/favorites/${encodeURIComponent(gameId)}`, {
      method: 'DELETE',
    }),

  trackView: (path: string) => post<{ ok: boolean }>('/api/analytics/view', { path }),

  publicMessages: (limit = 20) =>
    request<{ messages: MessageRow[] }>(`/api/messages/public?limit=${limit}`),
}

// ---------- 管理员 API ----------

export const adminApi = {
  stats: () => request<AdminStats>('/api/admin/stats'),

  users: (search?: string, page = 1, pageSize = 20) =>
    request<{ users: AdminUserRow[]; total: number }>(
      `/api/admin/users?search=${encodeURIComponent(search ?? '')}&limit=${pageSize}&offset=${(page - 1) * pageSize}`,
    ),

  userDetails: (id: string) => request<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),

  toggleBan: (id: string) => post<{ isBanned: boolean }>(`/api/admin/users/${encodeURIComponent(id)}/ban`),

  toggleAdmin: (id: string) => post<{ isAdmin: boolean }>(`/api/admin/users/${encodeURIComponent(id)}/admin`),

  resetPassword: (id: string, newPassword: string) =>
    post<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}/password`, { newPassword }),

  deleteUser: (id: string) =>
    request<unknown>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  debug: () => request<AdminDebug>('/api/admin/debug'),

  analytics: () => request<AdminAnalytics>('/api/admin/analytics'),
}

// ---------- 留言板 API ----------

export const messageApi = {
  create: (username: string, content: string) =>
    post<{ ok: boolean }>('/api/messages', { username, content }),

  list: (limit = 50, offset = 0) =>
    request<{ messages: MessageRow[]; total: number }>(
      `/api/messages?limit=${limit}&offset=${offset}`,
    ),

  delete: (id: number) =>
    request<unknown>(`/api/messages/${id}`, { method: 'DELETE' }),
}

// ---------- 好友 API ----------

export const friendApi = {
  list: () => request<{ friends: FriendUser[] }>('/api/friends'),

  search: (q: string) =>
    request<{ users: SearchResult[] }>(`/api/friends/search?q=${encodeURIComponent(q)}`),

  add: (userId: string) => post<{ ok: boolean }>(`/api/friends/${encodeURIComponent(userId)}`),

  remove: (userId: string) =>
    request<unknown>(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  matchHistory: () => request<{ history: MatchHistory[] }>('/api/friends/match-history'),
}

// ---------- 对局 API ----------

export const roomApi = {
  create: (gameId: string, preferredColor?: string) =>
    post<{ roomId: string }>('/api/rooms', { gameId, preferredColor }),

  list: () => request<{ rooms: RoomSummary[] }>('/api/rooms'),

  get: (id: string) => request<GameRoom>(`/api/rooms/${encodeURIComponent(id)}`),

  join: (id: string) => post<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(id)}/join`),

  move: (id: string, move: unknown) =>
    post<{ ok: boolean; currentTurn: string; movesCount: number }>(
      `/api/rooms/${encodeURIComponent(id)}/move`,
      { move },
    ),

  resign: (id: string) => post<{ ok: boolean; winner: string }>(`/api/rooms/${encodeURIComponent(id)}/resign`),

  exit: (id: string) =>
    request<unknown>(`/api/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
