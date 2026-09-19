/**
 * 推箱子关卡与核心逻辑。
 * 关卡用字符串数组表示：
 *   '#' 墙   ' ' 地板   '.' 目标点   '$' 箱子   '*' 箱子在目标上
 *   '@' 玩家   '+' 玩家在目标上
 */

export interface Point {
  x: number
  y: number
}

export interface Level {
  name: string
  map: string[]
}

export const LEVELS: Level[] = [
  {
    name: '入门',
    map: [
      '#####',
      '#   #',
      '#@$ #',
      '#  .#',
      '#####',
    ],
  },
  {
    name: '推一推',
    map: [
      '######',
      '#    #',
      '# @$ #',
      '#  . #',
      '#    #',
      '######',
    ],
  },
  {
    name: '双箱',
    map: [
      '#######',
      '#     #',
      '# $ $ #',
      '# @ . #',
      '#   . #',
      '#######',
    ],
  },
  {
    name: '转角',
    map: [
      '########',
      '#   #  #',
      '# $    #',
      '#  #.@ #',
      '#  ##  #',
      '#      #',
      '########',
    ],
  },
  {
    name: '小迷宫',
    map: [
      '########',
      '#      #',
      '# .**$@#',
      '#      #',
      '#####  #',
      '########',
    ],
  },
  {
    name: '经典一',
    map: [
      '  #####',
      '###   #',
      '#.@$  #',
      '### $.#',
      '#.##$ #',
      '# # . ##',
      '#$ *$$.#',
      '#   .  #',
      '########',
    ],
  },
  {
    name: '回旋',
    map: [
      '#######',
      '#     #',
      '# .$. #',
      '# $.$ #',
      '# .$. #',
      '#  @  #',
      '#######',
    ],
  },
  {
    name: '大厅',
    map: [
      '#########',
      '#   #   #',
      '# $ # $ #',
      '#  ...  #',
      '### # ###',
      '#  ...  #',
      '# $ # $ #',
      '#   @   #',
      '#########',
    ],
  },
]

export interface SokobanState {
  width: number
  height: number
  walls: Set<number>
  goals: Set<number>
  boxes: Set<number>
  player: number
  /** 走过的步数（玩家移动一格算一步） */
  moves: number
  /** 推动箱子的次数 */
  pushes: number
}

function idx(x: number, y: number, width: number) {
  return y * width + x
}

export function parseLevel(level: Level): SokobanState {
  const height = level.map.length
  const width = Math.max(...level.map.map((r) => r.length))
  const walls = new Set<number>()
  const goals = new Set<number>()
  const boxes = new Set<number>()
  let player = 0
  for (let y = 0; y < height; y++) {
    const row = level.map[y]
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? ' '
      const i = idx(x, y, width)
      if (ch === '#') walls.add(i)
      if (ch === '.' || ch === '*' || ch === '+') goals.add(i)
      if (ch === '$' || ch === '*') boxes.add(i)
      if (ch === '@' || ch === '+') player = i
    }
  }
  return { width, height, walls, goals, boxes, player, moves: 0, pushes: 0 }
}

export type DirKey = 'up' | 'down' | 'left' | 'right'
export const DIRS: Record<DirKey, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/** 尝试移动。返回新状态，若无法移动返回 null。 */
export function step(state: SokobanState, dir: DirKey): SokobanState | null {
  const d = DIRS[dir]
  const px = state.player % state.width
  const py = Math.floor(state.player / state.width)
  const nx = px + d.x
  const ny = py + d.y
  if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) return null
  const ni = idx(nx, ny, state.width)
  if (state.walls.has(ni)) return null

  const next: SokobanState = {
    ...state,
    boxes: new Set(state.boxes),
    moves: state.moves + 1,
    pushes: state.pushes,
  }

  if (state.boxes.has(ni)) {
    // 推箱子
    const bx = nx + d.x
    const by = ny + d.y
    if (bx < 0 || by < 0 || bx >= state.width || by >= state.height) return null
    const bi = idx(bx, by, state.width)
    if (state.walls.has(bi) || state.boxes.has(bi)) return null
    next.boxes.delete(ni)
    next.boxes.add(bi)
    next.pushes += 1
  }
  next.player = ni
  return next
}

export function isWin(state: SokobanState): boolean {
  for (const b of state.boxes) if (!state.goals.has(b)) return false
  return true
}

/**
 * 简单死锁检测：箱子被推入非目标点的死角（被相邻墙/角卡住且不在目标上）。
 * 仅检测「角落死锁」，足够给出提示。
 */
export function hasDeadlock(state: SokobanState): boolean {
  const w = state.width
  const h = state.height
  const isWall = (i: number) => state.walls.has(i)
  for (const b of state.boxes) {
    if (state.goals.has(b)) continue
    const x = b % w
    const y = Math.floor(b / w)
    const up = y <= 0 || isWall(b - w)
    const down = y >= h - 1 || isWall(b + w)
    const left = x <= 0 || isWall(b - 1)
    const right = x >= w - 1 || isWall(b + 1)
    if ((up || down) && (left || right)) return true
  }
  return false
}
