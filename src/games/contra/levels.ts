/**
 * 魂斗罗关卡定义。
 * 瓦片地图用字符串数组：'#' 实心平台，' ' 空气，
 * 'E' 步兵，'T' 炮台，'B' Boss，'S' 武器胶囊(S散射)，'L' 武器胶囊(L激光)，
 * 'P' 玩家出生点。
 * 每行长度决定关卡宽度。
 */

import { makeBoss, makeEnemy, makePlayer, TILE, type GameState } from './contraLogic'

export interface LevelDef {
  name: string
  map: string[]
  bossType: 'mech' | 'fortress'
  weaponPickups: Array<{ tx: number; ty: number; weapon: 'S' | 'L' }>
}

export const LEVELS: LevelDef[] = [
  {
    name: '丛林',
    bossType: 'mech',
    weaponPickups: [
      { tx: 18, ty: 8, weapon: 'S' },
      { tx: 40, ty: 6, weapon: 'L' },
    ],
    map: [
      '                                                                ',
      '                                                                ',
      '                                ####                            ',
      '                        ####                                    ',
      '              ####                                               ',
      '    ####                  T                          ####        ',
      '                  E         E         ####                E      ',
      '          S       ####              E              ####          ',
      '  P                       T                      E          B   ',
      '############      ############      ############      ###########',
      '################################################################',
    ],
  },
  {
    name: '瀑布',
    bossType: 'mech',
    weaponPickups: [
      { tx: 12, ty: 6, weapon: 'S' },
      { tx: 35, ty: 4, weapon: 'L' },
    ],
    map: [
      '                                          ',
      '          ####                            ',
      '      ####              ####              ',
      '                          E           ####',
      '  ####      T     ####         E          ',
      '              E                T       B  ',
      '         ####         L     ####          ',
      '  P            ####                        ',
      '####      E          ####      E          ',
      '############      ############      ########',
    ],
  },
  {
    name: '基地',
    bossType: 'fortress',
    weaponPickups: [
      { tx: 10, ty: 7, weapon: 'S' },
      { tx: 28, ty: 5, weapon: 'L' },
    ],
    map: [
      '                                          ',
      '         #####                            ',
      '     ####            ####                 ',
      '              T                E      ####',
      ' ####        E       ####   T             ',
      '         ####                 S       B   ',
      '              E         L             ####  ',
      '  P    ####         ####                   ',
      '####            E               E          ',
      '############      ############      ########',
    ],
  },
]

/** 从关卡定义构建初始游戏状态。 */
export function buildLevel(
  levelDef: LevelDef,
  stage: number,
  score: number,
  lives: number,
): GameState {
  const map = levelDef.map
  const rows = map.length
  const cols = Math.max(...map.map((r) => r.length))
  const tiles: number[][] = []
  const enemies: GameState['enemies'] = []
  const pickups: GameState['pickups'] = []
  let playerX = 64
  let playerY = 64
  let bossX = 0
  let bossY = 0
  let bossSpawn = false

  for (let ty = 0; ty < rows; ty++) {
    tiles[ty] = []
    const row = map[ty]
    for (let tx = 0; tx < cols; tx++) {
      const ch = row[tx] ?? ' '
      tiles[ty][tx] = ch === '#' ? 1 : 0
      const wx = tx * TILE
      const wy = ty * TILE
      switch (ch) {
        case 'P':
          playerX = wx
          playerY = wy
          break
        case 'E':
          enemies.push(makeEnemy('soldier', wx, wy))
          break
        case 'T':
          enemies.push(makeEnemy('turret', wx, wy))
          break
        case 'B':
          bossX = wx
          bossY = wy
          bossSpawn = true
          break
      }
    }
  }

  // 武器胶囊
  for (const wp of levelDef.weaponPickups) {
    pickups.push({
      x: wp.tx * TILE,
      y: wp.ty * TILE,
      w: 24,
      h: 24,
      weapon: wp.weapon,
      collected: false,
    })
  }

  const levelWidth = cols * TILE
  const levelHeight = rows * TILE

  const state: GameState = {
    player: makePlayer(playerX, playerY),
    enemies,
    bullets: [],
    pickups,
    particles: [],
    boss: bossSpawn ? makeBoss(levelDef.bossType, bossX, bossY, stage) : null,
    cameraX: 0,
    levelWidth,
    levelHeight,
    tiles,
    stage,
    bossTriggered: false,
    cleared: false,
    score,
    lives,
    time: 0,
  }
  return state
}
