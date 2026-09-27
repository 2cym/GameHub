/**
 * 五子棋核心逻辑：15×15 棋盘、五连判定、AI 评分表。
 * 1 = 黑（玩家先手可选），2 = 白（AI）。
 */

export const SIZE = 15
export type Stone = 0 | 1 | 2
export type Board = Stone[]

export function emptyBoard(): Board {
  return new Array(SIZE * SIZE).fill(0) as Stone[]
}

export function idx(x: number, y: number) {
  return y * SIZE + x
}

/** 检查在 (x,y) 落子后是否形成五连。 */
export function isWin(board: Board, x: number, y: number, stone: Stone): boolean {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]
  for (const [dx, dy] of dirs) {
    let count = 1
    for (let s = 1; s < 5; s++) {
      const nx = x + dx * s
      const ny = y + dy * s
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
      if (board[idx(nx, ny)] !== stone) break
      count++
    }
    for (let s = 1; s < 5; s++) {
      const nx = x - dx * s
      const ny = y - dy * s
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
      if (board[idx(nx, ny)] !== stone) break
      count++
    }
    if (count >= 5) return true
  }
  return false
}

/** 平局判定：棋盘满且无五连。 */
export function isFull(board: Board): boolean {
  return board.every((c) => c !== 0)
}

// ===== AI 评分表 =====
// 对一条线上某方的连子模式打分。模式按"连子数 + 是否两端开放"分级。

interface LineScore {
  /** 连续同色数 */
  count: number
  /** 开放端数 0/1/2 */
  open: number
}

function lineInfo(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number,
  stone: Stone,
): LineScore {
  let count = 1
  let open = 0
  // 正向
  let s = 1
  while (s < 5) {
    const nx = x + dx * s
    const ny = y + dy * s
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
    const v = board[idx(nx, ny)]
    if (v === stone) count++
    else {
      if (v === 0) open++
      break
    }
    s++
  }
  // 反向
  s = 1
  while (s < 5) {
    const nx = x - dx * s
    const ny = y - dy * s
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
    const v = board[idx(nx, ny)]
    if (v === stone) count++
    else {
      if (v === 0) open++
      break
    }
    s++
  }
  return { count, open }
}

/** 模式评分（参考连五/活四/冲四/活三/眠三/活二/眠二）。 */
function patternScore(count: number, open: number): number {
  if (count >= 5) return 1000000 // 连五
  if (count === 4) {
    if (open === 2) return 100000 // 活四
    if (open === 1) return 10000 // 冲四
    return 0
  }
  if (count === 3) {
    if (open === 2) return 5000 // 活三
    if (open === 1) return 500 // 眠三
    return 0
  }
  if (count === 2) {
    if (open === 2) return 200 // 活二
    if (open === 1) return 50 // 眠二
    return 0
  }
  if (count === 1) {
    if (open === 2) return 10
    if (open === 1) return 2
    return 0
  }
  return 0
}

/** 评估在 (x,y) 落子对 stone 的价值（四方向综合）。 */
export function evalPoint(board: Board, x: number, y: number, stone: Stone): number {
  if (board[idx(x, y)] !== 0) return 0
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]
  let total = 0
  // 临时落子评估
  board[idx(x, y)] = stone
  for (const [dx, dy] of dirs) {
    const info = lineInfo(board, x, y, dx, dy, stone)
    total += patternScore(info.count, info.open)
  }
  board[idx(x, y)] = 0
  return total
}

export type Difficulty = 'easy' | 'medium' | 'hard'

const NEIGHBORS: Array<[number, number]> = [
  [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
  [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [1, 0], [2, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
  [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2],
].map(([dx, dy]) => [dx, dy] as [number, number])

/** 候选点：仅考虑已有棋子周围 2 格内的空位，加速搜索。 */
export function candidates(board: Board): Array<[number, number]> {
  const set = new Set<number>()
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] === 0) continue
    const x = i % SIZE
    const y = Math.floor(i / SIZE)
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue
      if (board[idx(nx, ny)] === 0) set.add(idx(nx, ny))
    }
  }
  if (set.size === 0) return [[7, 7]] // 空盘天元
  return Array.from(set).map((i) => [i % SIZE, Math.floor(i / SIZE)] as [number, number])
}

/** AI 走子：综合"进攻(连自己) + 防守(堵对手)"评分，取最优。 */
export function aiMove(board: Board, ai: Stone, difficulty: Difficulty): [number, number] {
  const me = ai
  const opp = (ai === 1 ? 2 : 1) as Stone
  const cands = candidates(board)
  // 评分：自己进攻分 + 对手威胁分 * 防守权重
  const defense = difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 0.9 : 1.1
  // easy 引入随机扰动
  const noise = difficulty === 'easy' ? 300 : 0

  let best: [number, number] = cands[0]
  let bestScore = -1
  for (const [x, y] of cands) {
    const atk = evalPoint(board, x, y, me)
    const def = evalPoint(board, x, y, opp)
    // 必胜/必防优先
    let s = atk + def * defense
    if (noise > 0) s += Math.random() * noise
    if (s > bestScore) {
      bestScore = s
      best = [x, y]
    }
  }
  return best
}

// ===== 走法文本序列化（供 AI 模型 候选交换） =====

/** [x, y] → "x,y" */
export function moveToText(m: [number, number]): string {
  return `${m[0]},${m[1]}`
}

/**
 * 在给定候选集合内按"进攻 + 防守"评分选最优（AI 模型 粗筛后本地精筛）。
 * 与 aiMove 同一套评分，候选为空返回 null。
 */
export function bestOf(
  board: Board,
  ai: Stone,
  candidates: Array<[number, number]>,
): [number, number] | null {
  if (candidates.length === 0) return null
  const opp = (ai === 1 ? 2 : 1) as Stone
  let best: [number, number] | null = null
  let bestScore = -Infinity
  for (const [x, y] of candidates) {
    if (board[idx(x, y)] !== 0) continue
    const atk = evalPoint(board, x, y, ai)
    const def = evalPoint(board, x, y, opp)
    const s = atk + def
    if (s > bestScore) {
      bestScore = s
      best = [x, y]
    }
  }
  return best
}
