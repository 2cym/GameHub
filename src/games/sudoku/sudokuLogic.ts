/**
 * 数独核心逻辑：生成（保证唯一解）、求解、校验。
 * 棋盘用长度为 81 的数字数组表示，0 表示空格。行列均为 0..8。
 */

export type Grid = number[] // 长度 81

const N = 9
const BOX = 3

function rowOf(i: number) {
  return Math.floor(i / N)
}
function colOf(i: number) {
  return i % N
}
function boxOf(i: number) {
  return Math.floor(rowOf(i) / BOX) * BOX + Math.floor(colOf(i) / BOX)
}

/** 检查在 idx 放置 val 是否与同行/列/宫冲突（棋盘其余位置已定）。 */
export function canPlace(grid: Grid, idx: number, val: number): boolean {
  const r = rowOf(idx)
  const c = colOf(idx)
  const b = boxOf(idx)
  for (let i = 0; i < 81; i++) {
    if (i === idx) continue
    if (grid[i] === 0) continue
    if (rowOf(i) === r || colOf(i) === c || boxOf(i) === b) {
      if (grid[i] === val) return false
    }
  }
  return true
}

/** 返回某空格当前可填的候选值。 */
function candidates(grid: Grid, idx: number): number[] {
  const used = new Set<number>()
  const r = rowOf(idx)
  const c = colOf(idx)
  const b = boxOf(idx)
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0) continue
    if (rowOf(i) === r || colOf(i) === c || boxOf(i) === b) used.add(grid[i])
  }
  const out: number[] = []
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v)
  return out
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 回溯填充完整合法棋盘（从空格开始）。 */
function fill(grid: Grid): boolean {
  let idx = -1
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0) {
      idx = i
      break
    }
  }
  if (idx === -1) return true
  for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(grid, idx, v)) {
      grid[idx] = v
      if (fill(grid)) return true
      grid[idx] = 0
    }
  }
  return false
}

/** 统计解的数量（最多统计到 limit，用于判断唯一解）。 */
function countSolutions(grid: Grid, limit: number): number {
  let count = 0
  const work = [...grid]
  const solve = (): boolean => {
    // 选择候选最少的空格（MRV）加速
    let bestIdx = -1
    let bestCands: number[] | null = null
    for (let i = 0; i < 81; i++) {
      if (work[i] !== 0) continue
      const cands = candidates(work, i)
      if (cands.length === 0) return false // 死路
      if (bestCands === null || cands.length < bestCands.length) {
        bestCands = cands
        bestIdx = i
        if (cands.length === 1) break
      }
    }
    if (bestIdx === -1) {
      count++
      return count >= limit
    }
    for (const v of bestCands!) {
      work[bestIdx] = v
      if (solve()) return true
      work[bestIdx] = 0
    }
    return false
  }
  solve()
  return count
}

export type Difficulty = 'easy' | 'medium' | 'hard'

/** 各难度挖掉的格子数（越多越难）。 */
const HOLES: Record<Difficulty, number> = {
  easy: 38,
  medium: 46,
  hard: 52,
}

export interface SudokuPuzzle {
  /** 题目（含空格 0） */
  puzzle: Grid
  /** 完整解 */
  solution: Grid
}

/** 生成一局数独：先填完整解，再挖空且保证唯一解。 */
export function generateSudoku(difficulty: Difficulty): SudokuPuzzle {
  const solution: Grid = new Array(81).fill(0)
  fill(solution)

  const puzzle = [...solution]
  const order = shuffle(Array.from({ length: 81 }, (_, i) => i))
  let holes = 0
  const target = HOLES[difficulty]
  for (const idx of order) {
    if (holes >= target) break
    const backup = puzzle[idx]
    puzzle[idx] = 0
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[idx] = backup // 破坏唯一解，恢复
    } else {
      holes++
    }
  }
  return { puzzle, solution }
}

/** 校验整盘是否完成且全对。 */
export function isSolved(grid: Grid, solution: Grid): boolean {
  for (let i = 0; i < 81; i++) if (grid[i] !== solution[i]) return false
  return true
}

/** 返回与给定值冲突的格子索引集合（用于高亮）。 */
export function conflictsOf(grid: Grid, idx: number): Set<number> {
  const out = new Set<number>()
  const val = grid[idx]
  if (val === 0) return out
  const r = rowOf(idx)
  const c = colOf(idx)
  const b = boxOf(idx)
  for (let i = 0; i < 81; i++) {
    if (i === idx || grid[i] === 0) continue
    if (rowOf(i) === r || colOf(i) === c || boxOf(i) === b) {
      if (grid[i] === val) {
        out.add(i)
        out.add(idx)
      }
    }
  }
  return out
}

/** 整盘所有冲突格子（用于实时标红）。 */
export function allConflicts(grid: Grid): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0) continue
    const c = conflictsOf(grid, i)
    for (const x of c) out.add(x)
  }
  return out
}
