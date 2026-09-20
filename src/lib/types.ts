export interface User {
  id: string
  email: string
  username: string
  isAdmin?: boolean
}

export interface LeaderEntry {
  username: string
  score: number
}

export interface PersonalBest {
  gameId: string
  best: number
}

export interface ScoreRecord {
  gameId: string
  score: number
  createdAt: number
}

export type GameStatus = 'idle' | 'running' | 'paused' | 'over'

export interface GameProps {
  /** 一局结束时上报分数（由 GamePage 统一处理入榜/本地兜底） */
  onGameOver: (score: number) => void
}
