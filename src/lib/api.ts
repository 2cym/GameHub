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

export interface EmailCodeResult {
  ok: boolean
  /** 仅本地 mock 模式（未配置 RESEND_API_KEY）返回，方便联调 */
  devCode?: string
}

export const api = {
  sendEmailCode: (email: string, purpose: EmailCodePurpose) =>
    post<EmailCodeResult>('/api/auth/email-code', { email, purpose }),

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
}
