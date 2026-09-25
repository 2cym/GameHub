/**
 * 中国象棋核心逻辑：完整走法、将军/将死判定、AI 简单搜索。
 * 棋盘 9 列 × 10 行。红方在下（y=7..9），黑方在上（y=0..2）。
 * 用字符表示棋子：大写=红，小写=黑。
 *   帅/将 K(k)  仕/士 A(a)  相/象 B(b)  马 N(n)  车 R(r)  炮 C(c)  兵/卒 P(p)
 */

export const COLS = 9
export const ROWS = 10

export type Side = 'r' | 'b' // 红 / 黑

/** 棋盘：长度 90 的数组，空格为 null。 */
export type Board = (string | null)[]

export function emptyBoard(): Board {
  return new Array(COLS * ROWS).fill(null)
}

function sideOf(p: string | null): Side | null {
  if (!p) return null
  return p === p.toUpperCase() ? 'r' : 'b'
}

function inBoard(x: number, y: number) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS
}
function inPalace(x: number, y: number, side: Side) {
  if (x < 3 || x > 5) return false
  return side === 'r' ? y >= 7 && y <= 9 : y >= 0 && y <= 2
}

const idx = (x: number, y: number) => y * COLS + x

/** 初始棋盘。 */
export function initialBoard(): Board {
  const b = emptyBoard()
  // 黑方
  b[idx(0, 0)] = 'r'
  b[idx(1, 0)] = 'n'
  b[idx(2, 0)] = 'b'
  b[idx(3, 0)] = 'a'
  b[idx(4, 0)] = 'k'
  b[idx(5, 0)] = 'a'
  b[idx(6, 0)] = 'b'
  b[idx(7, 0)] = 'n'
  b[idx(8, 0)] = 'r'
  b[idx(1, 2)] = 'c'
  b[idx(7, 2)] = 'c'
  b[idx(0, 3)] = 'p'
  b[idx(2, 3)] = 'p'
  b[idx(4, 3)] = 'p'
  b[idx(6, 3)] = 'p'
  b[idx(8, 3)] = 'p'
  // 红方
  b[idx(0, 9)] = 'R'
  b[idx(1, 9)] = 'N'
  b[idx(2, 9)] = 'B'
  b[idx(3, 9)] = 'A'
  b[idx(4, 9)] = 'K'
  b[idx(5, 9)] = 'A'
  b[idx(6, 9)] = 'B'
  b[idx(7, 9)] = 'N'
  b[idx(8, 9)] = 'R'
  b[idx(1, 7)] = 'C'
  b[idx(7, 7)] = 'C'
  b[idx(0, 6)] = 'P'
  b[idx(2, 6)] = 'P'
  b[idx(4, 6)] = 'P'
  b[idx(6, 6)] = 'P'
  b[idx(8, 6)] = 'P'
  return b
}

export interface Move {
  from: number
  to: number
}

/** 生成某方所有合法走法（不含"走后将自杀"的过滤）。 */
function pseudoMoves(board: Board, side: Side): Move[] {
  const moves: Move[] = []
  for (let i = 0; i < COLS * ROWS; i++) {
    const p = board[i]
    if (!p || sideOf(p) !== side) continue
    const x = i % COLS
    const y = Math.floor(i / COLS)
    const kind = p.toLowerCase()
    const targets: number[] = []

    if (kind === 'r') {
      // 车：横竖直线
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        let nx = x + dx
        let ny = y + dy
        while (inBoard(nx, ny)) {
          const ni = idx(nx, ny)
          if (!board[ni]) {
            targets.push(ni)
          } else {
            if (sideOf(board[ni]) !== side) targets.push(ni)
            break
          }
          nx += dx
          ny += dy
        }
      }
    } else if (kind === 'n') {
      // 马：日字 + 蹩马腿
      const legs: Array<[number, number, number, number]> = [
        [1, 0, 2, 1],
        [-1, 0, -2, 1],
        [1, 0, 2, -1],
        [-1, 0, -2, -1],
        [0, 1, 1, 2],
        [0, -1, 1, -2],
        [0, 1, -1, 2],
        [0, -1, -1, -2],
      ]
      for (const [lx, ly, mx, my] of legs) {
        const legX = x + lx
        const legY = y + ly
        if (!inBoard(legX, legY)) continue
        if (board[idx(legX, legY)]) continue // 蹩马腿
        const nx = x + mx
        const ny = y + my
        if (!inBoard(nx, ny)) continue
        const t = board[idx(nx, ny)]
        if (!t || sideOf(t) !== side) targets.push(idx(nx, ny))
      }
    } else if (kind === 'b') {
      // 相/象：田字 + 塞象眼 + 不过河
      for (const [dx, dy] of [
        [2, 2],
        [-2, 2],
        [2, -2],
        [-2, -2],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (!inBoard(nx, ny)) continue
        // 不过河
        if (side === 'r' && ny < 5) continue
        if (side === 'b' && ny > 4) continue
        // 塞象眼
        const ex = x + dx / 2
        const ey = y + dy / 2
        if (board[idx(ex, ey)]) continue
        const t = board[idx(nx, ny)]
        if (!t || sideOf(t) !== side) targets.push(idx(nx, ny))
      }
    } else if (kind === 'a') {
      // 仕/士：九宫斜走一步
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (!inPalace(nx, ny, side)) continue
        const t = board[idx(nx, ny)]
        if (!t || sideOf(t) !== side) targets.push(idx(nx, ny))
      }
    } else if (kind === 'k') {
      // 帅/将：九宫直走一步
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (!inPalace(nx, ny, side)) continue
        const t = board[idx(nx, ny)]
        if (!t || sideOf(t) !== side) targets.push(idx(nx, ny))
      }
    } else if (kind === 'c') {
      // 炮：移动同车；吃子需隔一炮架
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        let nx = x + dx
        let ny = y + dy
        let jumped = false
        while (inBoard(nx, ny)) {
          const ni = idx(nx, ny)
          if (!jumped) {
            if (!board[ni]) {
              targets.push(ni)
            } else {
              jumped = true
            }
          } else {
            if (board[ni]) {
              if (sideOf(board[ni]) !== side) targets.push(ni)
              break
            }
          }
          nx += dx
          ny += dy
        }
      }
    } else if (kind === 'p') {
      // 兵/卒：未过河只能前进，过河可左右
      const fwd = side === 'r' ? -1 : 1
      const moves: Array<[number, number]> = [[0, fwd]]
      const crossed = side === 'r' ? y <= 4 : y >= 5
      if (crossed) {
        moves.push([1, 0])
        moves.push([-1, 0])
      }
      for (const [dx, dy] of moves) {
        const nx = x + dx
        const ny = y + dy
        if (!inBoard(nx, ny)) continue
        const t = board[idx(nx, ny)]
        if (!t || sideOf(t) !== side) targets.push(idx(nx, ny))
      }
    }

    for (const t of targets) moves.push({ from: i, to: t })
  }
  return moves
}

/** 找到某方将/帅位置。 */
function findKing(board: Board, side: Side): number {
  const k = side === 'r' ? 'K' : 'k'
  for (let i = 0; i < COLS * ROWS; i++) if (board[i] === k) return i
  return -1
}

/** 两将是否对面（白脸将）：同列且中间无子。 */
function kingsFace(board: Board): boolean {
  const rk = findKing(board, 'r')
  const bk = findKing(board, 'b')
  if (rk < 0 || bk < 0) return false
  const rx = rk % COLS
  const bx = bk % COLS
  if (rx !== bx) return false
  const ry = Math.floor(rk / COLS)
  const by = Math.floor(bk / COLS)
  const lo = Math.min(ry, by) + 1
  const hi = Math.max(ry, by)
  for (let y = lo; y < hi; y++) if (board[idx(rx, y)]) return false
  return true
}

/** 某方是否被将军（含白脸将）。 */
export function isInCheck(board: Board, side: Side): boolean {
  const king = findKing(board, side)
  if (king < 0) return true
  // 任何对方子能走到 king 位置即被将
  const opp: Side = side === 'r' ? 'b' : 'r'
  const oppMoves = pseudoMoves(board, opp)
  if (oppMoves.some((m) => m.to === king)) return true
  // 白脸将
  if (kingsFace(board)) return true
  return false
}

/** 应用走法（不改原棋盘）。 */
export function applyMove(board: Board, move: Move): Board {
  const next = [...board]
  next[move.to] = next[move.from]
  next[move.from] = null
  return next
}

/** 合法走法：走后自己不被将。 */
export function legalMoves(board: Board, side: Side): Move[] {
  return pseudoMoves(board, side).filter((m) => {
    const nb = applyMove(board, m)
    return !isInCheck(nb, side)
  })
}

/** 将死：被将且无合法走法。 */
export function isCheckmate(board: Board, side: Side): boolean {
  return isInCheck(board, side) && legalMoves(board, side).length === 0
}
/** 困毙：无合法走法（无论是否被将）。 */
export function isStalemate(board: Board, side: Side): boolean {
  return legalMoves(board, side).length === 0
}

// ===== AI =====
const VALUE: Record<string, number> = {
  r: 900,
  n: 40,
  b: 20,
  a: 20,
  k: 100000,
  c: 45,
  p: 10,
}

/** 简单位置加成（兵过河、车马炮居中）。 */
function posBonus(p: string, x: number, y: number): number {
  const kind = p.toLowerCase()
  if (kind === 'p') {
    const side = sideOf(p)!
    const crossed = side === 'r' ? y <= 4 : y >= 5
    return crossed ? 8 : 0
  }
  if (kind === 'n' || kind === 'c' || kind === 'r') {
    return 4 - Math.abs(x - 4) // 居中略好
  }
  return 0
}

export function evaluate(board: Board, side: Side): number {
  let score = 0
  for (let i = 0; i < COLS * ROWS; i++) {
    const p = board[i]
    if (!p) continue
    const v = VALUE[p.toLowerCase()] + posBonus(p, i % COLS, Math.floor(i / COLS))
    score += sideOf(p) === side ? v : -v
  }
  return score
}

/** 走法排序：吃子优先（MVV-LVA 简化）。 */
function moveScore(board: Board, m: Move): number {
  const victim = board[m.to]
  const attacker = board[m.from]
  if (!victim || !attacker) return 0
  return VALUE[victim.toLowerCase()] - VALUE[attacker.toLowerCase()]
}

/** Negamax + α-β 剪枝，深度 depth。 */
function negamax(
  board: Board,
  side: Side,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0) return evaluate(board, side)
  const moves = legalMoves(board, side)
  if (moves.length === 0) return -100000 // 输
  moves.sort((a, b) => moveScore(board, b) - moveScore(board, a))
  let best = -Infinity
  const opp: Side = side === 'r' ? 'b' : 'r'
  for (const m of moves) {
    const nb = applyMove(board, m)
    const score = -negamax(nb, opp, depth - 1, -beta, -alpha)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

export type Difficulty = 'easy' | 'medium' | 'hard'

/** AI 走子。 */
export function aiMove(
  board: Board,
  side: Side,
  difficulty: Difficulty,
): Move | null {
  const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3
  const moves = legalMoves(board, side)
  if (moves.length === 0) return null
  moves.sort((a, b) => moveScore(board, b) - moveScore(board, a))
  // easy 只取前若干随机一个，降低强度
  if (difficulty === 'easy') {
    const top = moves.slice(0, Math.min(6, moves.length))
    return top[Math.floor(Math.random() * top.length)]
  }
  const opp: Side = side === 'r' ? 'b' : 'r'
  let bestScore = -Infinity
  let best: Move[] = []
  for (const m of moves) {
    const nb = applyMove(board, m)
    const score = -negamax(nb, opp, depth - 1, -Infinity, Infinity)
    if (score > bestScore) {
      bestScore = score
      best = [m]
    } else if (score === bestScore) {
      best.push(m)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}

// ===== 走法文本序列化（供 Workers AI 候选交换） =====

/** Move → "从格-到格"，如 30-39 */
export function moveToText(m: Move): string {
  return `${m.from}-${m.to}`
}

/**
 * 在给定候选集合内做 α-β 搜索选最优（Workers AI 粗筛后本地精筛）。
 * 候选为空返回 null。
 */
export function bestOf(
  board: Board,
  side: Side,
  candidates: Move[],
  depth: number,
): Move | null {
  if (candidates.length === 0) return null
  const opp: Side = side === 'r' ? 'b' : 'r'
  const moves = candidates.slice().sort((a, b) => moveScore(board, b) - moveScore(board, a))
  let bestScore = -Infinity
  let best: Move[] = []
  for (const m of moves) {
    const nb = applyMove(board, m)
    const score = -negamax(nb, opp, depth - 1, -Infinity, Infinity)
    if (score > bestScore) {
      bestScore = score
      best = [m]
    } else if (score === bestScore) {
      best.push(m)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}

/** 走法合法性（供 UI 高亮用）。 */
export function legalTargets(board: Board, from: number, side: Side): number[] {
  const piece = board[from]
  if (!piece || sideOf(piece) !== side) return []
  return legalMoves(board, side)
    .filter((m) => m.from === from)
    .map((m) => m.to)
}
