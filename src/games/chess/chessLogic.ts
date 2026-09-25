/**
 * 国际象棋核心逻辑：六种棋子完整走法、王车易位、吃过路兵、兵升变、
 * 将军/将死/逼和判定，以及 α-β 剪枝 AI。
 * 棋盘 8×8。白方在底（rank 0 = y=0 是黑方底线，y=7 是白方底线）。
 * 用字符表示棋子：大写=白，小写=黑。P/N/B/R/Q/K。
 * 坐标：x=file(a..h=0..7)，y=rank(0=黑底..7=白底)。
 */

export const N = 8
export type Side = 'w' | 'b'
export type Board = (string | null)[] // 长度 64

export interface Castling {
  wk: boolean // 白短易位
  wq: boolean // 白长易位
  bk: boolean
  bq: boolean
}
export interface State {
  board: Board
  turn: Side
  castling: Castling
  /** 吃过路兵目标格；若上一步是兵进二，则记录其"跳过"的格。 */
  enPassant: number | null
}

export function emptyState(): State {
  return {
    board: new Array(N * N).fill(null),
    turn: 'w',
    castling: { wk: true, wq: true, bk: true, bq: true },
    enPassant: null,
  }
}

export function initialState(): State {
  const s = emptyState()
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  for (let x = 0; x < N; x++) {
    s.board[x] = back[x] // 黑底线 y=0
    s.board[x + N] = 'p' // 黑兵 y=1
    s.board[x + 6 * N] = 'P' // 白兵 y=6
    s.board[x + 7 * N] = back[x].toUpperCase() // 白底线 y=7
  }
  return s
}

const idx = (x: number, y: number) => y * N + x
function sideOf(p: string | null): Side | null {
  if (!p) return null
  return p === p.toUpperCase() ? 'w' : 'b'
}
function inBoard(x: number, y: number) {
  return x >= 0 && x < N && y >= 0 && y < N
}

export interface Move {
  from: number
  to: number
  /** 升变成什么（兵到底线时）。 */
  promo?: string
  /** 王车易位标记。 */
  castle?: 'k' | 'q'
  /** 吃过路兵标记。 */
  enPassant?: boolean
}

/** 生成某方伪走法（不含走后自将的过滤；含易位/过路兵）。 */
function pseudoMoves(s: State): Move[] {
  const { board, turn, castling, enPassant } = s
  const moves: Move[] = []
  for (let i = 0; i < N * N; i++) {
    const p = board[i]
    if (!p || sideOf(p) !== turn) continue
    const x = i % N
    const y = Math.floor(i / N)
    const kind = p.toLowerCase()
    const targets: Array<[number, number] | [number, number, Partial<Move>]> = []

    if (kind === 'p') {
      const fwd = turn === 'w' ? -1 : 1
      const startRank = turn === 'w' ? 6 : 1
      const promoRank = turn === 'w' ? 0 : 7
      // 前进一格
      const ny = y + fwd
      if (inBoard(x, ny) && !board[idx(x, ny)]) {
        if (ny === promoRank) {
          for (const pr of ['q', 'r', 'b', 'n'])
            targets.push([x, ny, { promo: pr }])
        } else {
          targets.push([x, ny])
        }
        // 起始位前进两格
        if (y === startRank) {
          const ny2 = y + 2 * fwd
          if (inBoard(x, ny2) && !board[idx(x, ny2)])
            targets.push([x, ny2])
        }
      }
      // 斜吃 + 过路兵
      for (const dx of [-1, 1]) {
        const nx = x + dx
        if (!inBoard(nx, ny)) continue
        const ni = idx(nx, ny)
        const t = board[ni]
        if (t && sideOf(t) !== turn) {
          if (ny === promoRank) {
            for (const pr of ['q', 'r', 'b', 'n'])
              targets.push([nx, ny, { promo: pr }])
          } else {
            targets.push([nx, ny])
          }
        }
        // 吃过路兵
        if (enPassant !== null && ni === enPassant) {
          targets.push([nx, ny, { enPassant: true }])
        }
      }
    } else if (kind === 'n') {
      for (const [dx, dy] of [
        [1, 2], [2, 1], [2, -1], [1, -2],
        [-1, -2], [-2, -1], [-2, 1], [-1, 2],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (!inBoard(nx, ny)) continue
        const t = board[idx(nx, ny)]
        if (!t || sideOf(t) !== turn) targets.push([nx, ny])
      }
    } else if (kind === 'b' || kind === 'r' || kind === 'q') {
      const dirs: number[][] =
        kind === 'b'
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : kind === 'r'
            ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
            : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
      for (const [dx, dy] of dirs) {
        let nx = x + dx
        let ny = y + dy
        while (inBoard(nx, ny)) {
          const ni = idx(nx, ny)
          const t = board[ni]
          if (!t) {
            targets.push([nx, ny])
          } else {
            if (sideOf(t) !== turn) targets.push([nx, ny])
            break
          }
          nx += dx
          ny += dy
        }
      }
    } else if (kind === 'k') {
      for (const [dx, dy] of [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (!inBoard(nx, ny)) continue
        const t = board[idx(nx, ny)]
        if (!t || sideOf(t) !== turn) targets.push([nx, ny])
      }
      // 王车易位
      const rank = turn === 'w' ? 7 : 0
      if (y === rank && x === 4) {
        const kSide = turn === 'w' ? castling.wk : castling.bk
        const qSide = turn === 'w' ? castling.wq : castling.bq
        if (kSide && !board[idx(5, rank)] && !board[idx(6, rank)] &&
            board[idx(7, rank)]?.toLowerCase() === 'r' &&
            !isAttacked(board, 4, rank, turn) &&
            !isAttacked(board, 5, rank, turn) &&
            !isAttacked(board, 6, rank, turn)) {
          targets.push([6, rank, { castle: 'k' }])
        }
        if (qSide && !board[idx(3, rank)] && !board[idx(2, rank)] && !board[idx(1, rank)] &&
            board[idx(0, rank)]?.toLowerCase() === 'r' &&
            !isAttacked(board, 4, rank, turn) &&
            !isAttacked(board, 3, rank, turn) &&
            !isAttacked(board, 2, rank, turn)) {
          targets.push([2, rank, { castle: 'q' }])
        }
      }
    }

    for (const [tx, ty, extra] of targets) {
      moves.push({ from: i, to: idx(tx, ty), ...extra })
    }
  }
  return moves
}

/** 某格是否被对方攻击（不含易位；用于将军与易位判定）。 */
function isAttacked(board: Board, x: number, y: number, defender: Side): boolean {
  const attacker: Side = defender === 'w' ? 'b' : 'w'
  // 兵
  const pawnDir = attacker === 'w' ? 1 : -1 // 白兵从下往上吃，攻击格在 y+pawnDir
  for (const dx of [-1, 1]) {
    const nx = x + dx
    const ny = y + pawnDir
    if (inBoard(nx, ny)) {
      const p = board[idx(nx, ny)]
      if (p && sideOf(p) === attacker && p.toLowerCase() === 'p') return true
    }
  }
  // 马
  for (const [dx, dy] of [
    [1, 2], [2, 1], [2, -1], [1, -2],
    [-1, -2], [-2, -1], [-2, 1], [-1, 2],
  ]) {
    const nx = x + dx
    const ny = y + dy
    if (inBoard(nx, ny)) {
      const p = board[idx(nx, ny)]
      if (p && sideOf(p) === attacker && p.toLowerCase() === 'n') return true
    }
  }
  // 滑行：车/后（横竖）、象/后（斜）
  const rayAttack = (dirs: number[][], kinds: string[]) => {
    for (const [dx, dy] of dirs) {
      let nx = x + dx
      let ny = y + dy
      while (inBoard(nx, ny)) {
        const p = board[idx(nx, ny)]
        if (p) {
          if (sideOf(p) === attacker && kinds.includes(p.toLowerCase())) return true
          break
        }
        nx += dx
        ny += dy
      }
    }
    return false
  }
  if (rayAttack([[1, 0], [-1, 0], [0, 1], [0, -1]], ['r', 'q'])) return true
  if (rayAttack([[1, 1], [1, -1], [-1, 1], [-1, -1]], ['b', 'q'])) return true
  // 王
  for (const [dx, dy] of [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]) {
    const nx = x + dx
    const ny = y + dy
    if (inBoard(nx, ny)) {
      const p = board[idx(nx, ny)]
      if (p && sideOf(p) === attacker && p.toLowerCase() === 'k') return true
    }
  }
  return false
}

function findKing(board: Board, side: Side): number {
  const k = side === 'w' ? 'K' : 'k'
  for (let i = 0; i < N * N; i++) if (board[i] === k) return i
  return -1
}

/** 应用走法，返回新状态。 */
export function applyMove(s: State, m: Move): State {
  const board = [...s.board]
  const mover = board[m.from]!
  const turn = s.turn
  const castling = { ...s.castling }
  let enPassant: number | null = null

  // 兵进二：记录过路兵格
  if (mover.toLowerCase() === 'p' && Math.abs(m.to - m.from) === N * 2) {
    enPassant = m.from + (m.to > m.from ? N : -N)
  }

  // 吃过路兵：移除被吃的兵
  if (m.enPassant) {
    const dir = turn === 'w' ? 1 : -1
    board[m.to + dir * N] = null
  }

  // 王车易位：移动车
  if (m.castle === 'k') {
    const rank = turn === 'w' ? 7 : 0
    board[idx(5, rank)] = board[idx(7, rank)]
    board[idx(7, rank)] = null
  } else if (m.castle === 'q') {
    const rank = turn === 'w' ? 7 : 0
    board[idx(3, rank)] = board[idx(0, rank)]
    board[idx(0, rank)] = null
  }

  // 主走法
  board[m.to] = m.promo ? (turn === 'w' ? m.promo.toUpperCase() : m.promo) : mover
  board[m.from] = null

  // 更新易位权
  if (mover.toLowerCase() === 'k') {
    if (turn === 'w') {
      castling.wk = false
      castling.wq = false
    } else {
      castling.bk = false
      castling.bq = false
    }
  }
  // 车移动或被吃
  const rookMoved = (i: number) => {
    if (board[i]?.toLowerCase() !== 'r' && mover.toLowerCase() !== 'r') return false
    return true
  }
  if (mover.toLowerCase() === 'r' || rookMoved(m.from)) {
    if (turn === 'w' && m.from === idx(0, 7)) castling.wq = false
    if (turn === 'w' && m.from === idx(7, 7)) castling.wk = false
    if (turn === 'b' && m.from === idx(0, 0)) castling.bq = false
    if (turn === 'b' && m.from === idx(7, 0)) castling.bk = false
  }
  // 车被吃也要清权
  if (m.to === idx(0, 7)) castling.wq = false
  if (m.to === idx(7, 7)) castling.wk = false
  if (m.to === idx(0, 0)) castling.bq = false
  if (m.to === idx(7, 0)) castling.bk = false

  return {
    board,
    turn: turn === 'w' ? 'b' : 'w',
    castling,
    enPassant,
  }
}

export function isInCheck(s: State, side: Side): boolean {
  const k = findKing(s.board, side)
  if (k < 0) return true
  const x = k % N
  const y = Math.floor(k / N)
  return isAttacked(s.board, x, y, side)
}

/** 合法走法：走后己方不被将。 */
export function legalMoves(s: State): Move[] {
  return pseudoMoves(s).filter((m) => {
    const ns = applyMove(s, m)
    return !isInCheck(ns, s.turn)
  })
}

export function isCheckmate(s: State): boolean {
  return isInCheck(s, s.turn) && legalMoves(s).length === 0
}
export function isStalemate(s: State): boolean {
  return !isInCheck(s, s.turn) && legalMoves(s).length === 0
}

/** 合法落点（供 UI 高亮）。 */
export function legalTargets(s: State, from: number): number[] {
  return legalMoves(s)
    .filter((m) => m.from === from)
    .map((m) => m.to)
}

// ===== AI =====
const VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
}
// 简单兵表（鼓励推进）
function posBonus(p: string, x: number, y: number): number {
  const kind = p.toLowerCase()
  if (kind === 'p') {
    const side = sideOf(p)!
    const adv = side === 'w' ? 6 - y : y - 1
    return adv * 4 + (3 - Math.abs(x - 3.5))
  }
  return 3 - Math.abs(x - 3.5)
}

export function evaluate(s: State, side: Side): number {
  let score = 0
  for (let i = 0; i < N * N; i++) {
    const p = s.board[i]
    if (!p) continue
    const v = VALUE[p.toLowerCase()] + posBonus(p, i % N, Math.floor(i / N))
    score += sideOf(p) === side ? v : -v
  }
  return score
}

function moveScore(s: State, m: Move): number {
  const victim = s.board[m.to]
  if (!victim) return 0
  const attacker = s.board[m.from]!
  return VALUE[victim.toLowerCase()] - VALUE[attacker.toLowerCase()]
}

function negamax(
  s: State,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0) return evaluate(s, s.turn)
  const moves = legalMoves(s)
  if (moves.length === 0) {
    return isInCheck(s, s.turn) ? -100000 : 0 // 将死/逼和
  }
  moves.sort((a, b) => moveScore(s, b) - moveScore(s, a))
  let best = -Infinity
  for (const m of moves) {
    const ns = applyMove(s, m)
    const score = -negamax(ns, depth - 1, -beta, -alpha)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export function aiMove(s: State, difficulty: Difficulty): Move | null {
  const depth = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4
  const moves = legalMoves(s)
  if (moves.length === 0) return null
  moves.sort((a, b) => moveScore(s, b) - moveScore(s, a))
  if (difficulty === 'easy') {
    const top = moves.slice(0, Math.min(5, moves.length))
    return top[Math.floor(Math.random() * top.length)]
  }
  let bestScore = -Infinity
  let best: Move[] = []
  for (const m of moves) {
    const ns = applyMove(s, m)
    const score = -negamax(ns, depth - 1, -Infinity, Infinity)
    if (score > bestScore) {
      bestScore = score
      best = [m]
    } else if (score === bestScore) {
      best.push(m)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}

// ===== 走法文本序列化（供 AI 模型 候选交换） =====

const FILES = 'abcdefgh'
const fileChar = (x: number) => FILES[x]
/** y=0 是黑方底线即第 8 排 */
const rankChar = (y: number) => String(8 - y)
const square = (i: number) => fileChar(i % N) + rankChar(Math.floor(i / N))

/** Move → UCI 文本，如 e2e4 / e7e8q */
export function moveToText(m: Move): string {
  return square(m.from) + square(m.to) + (m.promo ?? '')
}

/**
 * 在给定候选集合内做 α-β 搜索选最优（AI 模型 粗筛后本地精筛）。
 * depth 为剩余搜索深度；候选为空返回 null。
 */
export function bestOf(s: State, candidates: Move[], depth: number): Move | null {
  if (candidates.length === 0) return null
  const moves = candidates.slice().sort((a, b) => moveScore(s, b) - moveScore(s, a))
  let bestScore = -Infinity
  let best: Move[] = []
  for (const m of moves) {
    const ns = applyMove(s, m)
    const score = -negamax(ns, depth - 1, -Infinity, Infinity)
    if (score > bestScore) {
      bestScore = score
      best = [m]
    } else if (score === bestScore) {
      best.push(m)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}
