/** 头像资料。avatarColor 是调色板下标；接口以字符串返回，由 <Avatar /> 做边界校正 */
export interface AvatarInfo {
  avatarEmoji?: string
  avatarColor?: number | string
}

export interface User extends AvatarInfo {
  id: string
  email: string
  username: string
  isAdmin?: boolean
}

export interface LeaderEntry extends AvatarInfo {
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
