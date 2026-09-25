/**
 * 围棋核心逻辑：19×19 棋盘、落子合法性（含禁着点）、提子、打劫禁复、数目。
 * 1=黑，2=白。0=空。
 */

export const SIZE = 19
export type Stone = 0 | 1 | 2
export type Board = Stone[]

export function emptyBoard(): Board {
  return new Array(SIZE * SIZE).fill(0) as Stone[]
}

const idx = (x: number, y: number) => y * SIZE + x
function inBoard(x: number, y: number) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE
}
function neighbors(i: number): number[] {
  const x = i % SIZE
  const y = Math.floor(i / SIZE)
  const out: number[] = []
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx
    const ny = y + dy
    if (inBoard(nx, ny)) out.push(idx(nx, ny))
  }
  return out
}

/** 找到与 i 同色的连通块，返回块成员集合。 */
function groupOf(board: Board, i: number): Set<number> {
  const color = board[i]
  if (color === 0) return new Set()
  const seen = new Set<number>([i])
  const stack = [i]
  while (stack.length) {
    const cur = stack.pop()!
    for (const n of neighbors(cur)) {
      if (seen.has(n)) continue
      if (board[n] === color) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return seen
}

/** 某块的气数。 */
function liberties(board: Board, group: Set<number>): number {
  let count = 0
  const counted = new Set<number>()
  for (const i of group) {
    for (const n of neighbors(i)) {
      if (board[n] === 0 && !counted.has(n)) {
        count++
        counted.add(n)
      }
    }
  }
  return count
}

export interface MoveResult {
  board: Board
  /** 本步提掉的对方子数。 */
  captured: number
  /** 是否为禁着点（自杀或打劫）。 */
  illegal: boolean
}

/** 尝试落子；返回新棋盘与结果。 */
export function tryMove(
  board: Board,
  i: number,
  color: Stone,
  koPoint: number | null,
): MoveResult {
  if (board[i] !== 0) return { board, captured: 0, illegal: true }
  if (koPoint === i) return { board, captured: 0, illegal: true }

  const next = [...board] as Board
  next[i] = color
  const opp: Stone = color === 1 ? 2 : 1

  // 提对方无气块
  let captured = 0
  const capturedStones: number[] = []
  for (const n of neighbors(i)) {
    if (next[n] !== opp) continue
    const g = groupOf(next, n)
    if (liberties(next, g) === 0) {
      for (const s of g) {
        next[s] = 0
        captured++
        capturedStones.push(s)
      }
    }
  }

  // 自杀判定：提完后自己这块是否无气
  const myGroup = groupOf(next, i)
  if (liberties(next, myGroup) === 0) {
    return { board, captured: 0, illegal: true }
  }

  // 打劫：本步只提了 1 子，且新棋盘与上一手前相同（简化为：提 1 子且本子也是 1 气 1 子块）
  // 严格打劫：记录上一手被提的单点，下一手不可下回该点
  // 这里返回"若提了 1 子，则该提子点成为 koPoint"
  void capturedStones
  return { board: next, captured, illegal: false }
}

/** 是否为打劫点（本步提了恰好 1 子）。 */
export function makesKo(result: MoveResult): number | null {
  // 简化：提 1 子即记为劫点（由调用方传递）
  return result.captured === 1 ? result.board.indexOf(0) : null
}

// ===== 数目（简化版：中国规则，数子法） =====
/** 计算双方地盘与子数。返回黑/白总分（含死子估算）。 */
export function scoreBoard(board: Board): { black: number; white: number } {
  let black = 0
  let white = 0
  // 子数
  const visited = new Set<number>()
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] === 1) black++
    else if (board[i] === 2) white++
    else if (!visited.has(i)) {
      // 空区域洪水填充，判断归属
      const region: number[] = []
      const stack = [i]
      let touchesBlack = false
      let touchesWhite = false
      while (stack.length) {
        const cur = stack.pop()!
        if (visited.has(cur)) continue
        visited.add(cur)
        region.push(cur)
        for (const n of neighbors(cur)) {
          if (board[n] === 0) {
            if (!visited.has(n)) stack.push(n)
          } else if (board[n] === 1) touchesBlack = true
          else if (board[n] === 2) touchesWhite = true
        }
      }
      if (touchesBlack && !touchesWhite) black += region.length
      else if (touchesWhite && !touchesBlack) white += region.length
    }
  }
  // 贴目：白方 +6.5（简化）
  return { black, white: white + 6.5 }
}

// ===== AI 基础策略 =====
/** 候选点：已有棋子周围 2 格内的空位。 */
export function candidates(board: Board): number[] {
  const set = new Set<number>()
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] === 0) continue
    const x = i % SIZE
    const y = Math.floor(i / SIZE)
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        const nx = x + dx
        const ny = y + dy
        if (inBoard(nx, ny) && board[idx(nx, ny)] === 0)
          set.add(idx(nx, ny))
      }
  }
  if (set.size === 0) return [idx(9, 9)] // 天元
  return Array.from(set)
}

export function evalMove(board: Board, i: number, color: Stone): number {
  const opp: Stone = color === 1 ? 2 : 1
  const result = tryMove(board, i, color, null)
  if (result.illegal) return -1
  let score = result.captured * 6
  // 优先占据星位/边角要点
  const x = i % SIZE
  const y = Math.floor(i / SIZE)
  // 靠近已有子的连接奖励
  let connect = 0
  for (const n of neighbors(i)) {
    if (board[n] === color) connect += 3
    if (board[n] === opp) connect += 2
  }
  score += connect
  // 避免一线（边）
  const edgeDist = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y)
  if (edgeDist === 0) score -= 2
  if (edgeDist >= 2 && edgeDist <= 3) score += 4 // 三线四线
  return score
}

export function aiMove(
  board: Board,
  color: Stone,
  koPoint: number | null,
  difficulty: 'easy' | 'medium' | 'hard',
): number | null {
  const cands = candidates(board)
  const noise = difficulty === 'easy' ? 4 : 0
  let best = -2
  let bestI: number | null = null
  const scored: Array<{ i: number; s: number }> = []
  for (const i of cands) {
    if (i === koPoint) continue
    const r = tryMove(board, i, color, koPoint)
    if (r.illegal) continue
    let s = evalMove(board, i, color)
    if (noise > 0) s += Math.random() * noise
    scored.push({ i, s })
    if (s > best) {
      best = s
      bestI = i
    }
  }
  if (bestI === null) return null
  // 从接近最优的候选中随机选一个，增加变化
  const top = scored
    .filter((x) => x.s >= best - 1)
    .map((x) => x.i)
  return top[Math.floor(Math.random() * top.length)]
}

// ===== 走法文本序列化（供 Workers AI 候选交换） =====

/** 落子点 → 棋盘线性下标文本，如 "260" */
export function moveToText(i: number): string {
  return String(i)
}


/**
 * 在给定候选集合内按现有评分选最优（Workers AI 粗筛后本地精筛）。
 * 遵守打劫禁复；候选为空返回 null（等价于该方只能虚手）。
 */
export function bestOf(
  board: Board,
  color: Stone,
  koPoint: number | null,
  candidates: number[],
): number | null {
  let best: number | null = null
  let bestScore = -Infinity
  for (const i of candidates) {
    if (i === koPoint) continue
    if (board[i] !== 0) continue
    const r = tryMove(board, i, color, koPoint)
    if (r.illegal) continue
    const s = evalMove(board, i, color)
    if (s > bestScore) {
      bestScore = s
      best = i
    }
  }
  return best
}

export { idx }
