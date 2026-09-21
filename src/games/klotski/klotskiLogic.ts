/**
 * 华容道核心逻辑。
 * 棋盘固定 4 列 × 5 行。棋子为占据矩形格的块：
 *   cao  曹操 2×2（目标块，需移到底部出口）
 *   关羽 2×1 横、张飞/赵云/马超/黄忠 1×2 竖、兵 1×1
 * 出口在底部中央（第 3、4 列，第 5 行下方），曹操覆盖 (1,4)(2,4) 即获胜。
 */

export const COLS = 4
export const ROWS = 5

export interface Piece {
  id: string
  name: string
  /** 宽（列数） */
  w: number
  /** 高（行数） */
  h: number
  /** 左上角列 */
  x: number
  /** 左上角行 */
  y: number
  /** 是否为目标块（曹操） */
  target?: boolean
}

export interface Layout {
  name: string
  /** 难度参考最少步数（用于计分） */
  par: number
  pieces: Piece[]
}

export const LAYOUTS: Layout[] = [
  {
    name: '横刀立马',
    par: 81,
    pieces: [
      { id: 'cao', name: '曹操', w: 2, h: 2, x: 1, y: 0, target: true },
      { id: 'zhang', name: '张飞', w: 1, h: 2, x: 0, y: 0 },
      { id: 'zhao', name: '赵云', w: 1, h: 2, x: 3, y: 0 },
      { id: 'guan', name: '关羽', w: 2, h: 1, x: 1, y: 2 },
      { id: 'ma', name: '马超', w: 1, h: 2, x: 0, y: 2 },
      { id: 'huang', name: '黄忠', w: 1, h: 2, x: 3, y: 2 },
      { id: 'b1', name: '兵', w: 1, h: 1, x: 1, y: 3 },
      { id: 'b2', name: '兵', w: 1, h: 1, x: 2, y: 3 },
      { id: 'b3', name: '兵', w: 1, h: 1, x: 0, y: 4 },
      { id: 'b4', name: '兵', w: 1, h: 1, x: 3, y: 4 },
    ],
  },
  {
    name: '指挥若定',
    par: 62,
    pieces: [
      { id: 'cao', name: '曹操', w: 2, h: 2, x: 1, y: 0, target: true },
      { id: 'zhang', name: '张飞', w: 1, h: 2, x: 0, y: 0 },
      { id: 'zhao', name: '赵云', w: 1, h: 2, x: 3, y: 0 },
      { id: 'ma', name: '马超', w: 1, h: 2, x: 0, y: 2 },
      { id: 'huang', name: '黄忠', w: 1, h: 2, x: 3, y: 2 },
      { id: 'b1', name: '兵', w: 1, h: 1, x: 1, y: 2 },
      { id: 'b2', name: '兵', w: 1, h: 1, x: 2, y: 2 },
      { id: 'guan', name: '关羽', w: 2, h: 1, x: 1, y: 3 },
      { id: 'b3', name: '兵', w: 1, h: 1, x: 0, y: 4 },
      { id: 'b4', name: '兵', w: 1, h: 1, x: 3, y: 4 },
    ],
  },
  {
    name: '兵分三路',
    par: 40,
    pieces: [
      { id: 'zhang', name: '张飞', w: 1, h: 2, x: 0, y: 0 },
      { id: 'zhao', name: '赵云', w: 1, h: 2, x: 3, y: 0 },
      { id: 'b1', name: '兵', w: 1, h: 1, x: 1, y: 0 },
      { id: 'b2', name: '兵', w: 1, h: 1, x: 2, y: 0 },
      { id: 'cao', name: '曹操', w: 2, h: 2, x: 1, y: 1, target: true },
      { id: 'ma', name: '马超', w: 1, h: 2, x: 0, y: 2 },
      { id: 'huang', name: '黄忠', w: 1, h: 2, x: 3, y: 2 },
      { id: 'guan', name: '关羽', w: 2, h: 1, x: 1, y: 3 },
      { id: 'b3', name: '兵', w: 1, h: 1, x: 0, y: 4 },
      { id: 'b4', name: '兵', w: 1, h: 1, x: 3, y: 4 },
    ],
  },
]

/** 计算某棋子在给定集合中，沿某方向可滑动的最大步数（不越界、不重叠）。 */
export function slideRange(
  piece: Piece,
  pieces: Piece[],
): { minX: number; maxX: number; minY: number; maxY: number } {
  const occupied = new Set<string>()
  for (const p of pieces) {
    if (p.id === piece.id) continue
    for (let dy = 0; dy < p.h; dy++)
      for (let dx = 0; dx < p.w; dx++) occupied.add(`${p.x + dx},${p.y + dy}`)
  }
  const free = (x: number, y: number) => {
    for (let dy = 0; dy < piece.h; dy++)
      for (let dx = 0; dx < piece.w; dx++) {
        const cx = x + dx
        const cy = y + dy
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false
        if (occupied.has(`${cx},${cy}`)) return false
      }
    return true
  }
  let minX = piece.x
  let maxX = piece.x
  let minY = piece.y
  let maxY = piece.y
  while (free(minX - 1, piece.y)) minX--
  while (free(maxX + 1, piece.y)) maxX++
  while (free(piece.x, minY - 1)) minY--
  while (free(piece.x, maxY + 1)) maxY++
  return { minX, maxX, minY, maxY }
}

/** 是否获胜：曹操到达底部出口（覆盖第 1、2 列的第 4 行）。 */
export function isEscaped(pieces: Piece[]): boolean {
  const cao = pieces.find((p) => p.target)
  if (!cao) return false
  return cao.x === 1 && cao.y === 3
}
