/**
 * 魂斗罗核心逻辑：物理、碰撞、实体定义、敌人 AI、Boss。
 * 纯数据与函数，不涉及 React/Canvas，便于测试。
 */

export const TILE = 32
export const GRAVITY = 1800 // px/s²
export const MOVE_SPEED = 260 // px/s
export const JUMP_VEL = 640 // px/s
export const BULLET_SPEED = 620
export const FIRE_COOLDOWN = 0.16 // s

export type WeaponType = 'R' | 'S' | 'L'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Entity extends Rect {
  vx: number
  vy: number
  onGround: boolean
  facing: 1 | -1
  alive: boolean
  hp: number
}

export interface Player extends Entity {
  invuln: number // 无敌时间
  fireTimer: number
  weapon: WeaponType
  ammo: number
}

export interface Enemy extends Entity {
  type: 'soldier' | 'turret'
  fireTimer: number
  /** 巡逻范围 */
  range: [number, number]
  /** 初始 x */
  homeX: number
}

export interface Boss extends Entity {
  type: 'mech' | 'fortress'
  phase: number
  fireTimer: number
  pattern: number
  maxHp: number
}

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  from: 'player' | 'enemy'
  type: WeaponType
  life: number
}

export interface Pickup {
  x: number
  y: number
  w: number
  h: number
  weapon: WeaponType
  collected: boolean
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  size: number
}

export interface GameState {
  player: Player
  enemies: Enemy[]
  bullets: Bullet[]
  pickups: Pickup[]
  particles: Particle[]
  boss: Boss | null
  cameraX: number
  levelWidth: number
  levelHeight: number
  tiles: number[][] // 0=空 1=平台
  stage: number
  bossTriggered: boolean
  cleared: boolean
  score: number
  lives: number
  time: number
}

export function makePlayer(spawnX: number, spawnY: number): Player {
  return {
    x: spawnX,
    y: spawnY,
    w: 22,
    h: 38,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    alive: true,
    hp: 1,
    invuln: 0,
    fireTimer: 0,
    weapon: 'R',
    ammo: 999,
  }
}

export function makeEnemy(
  type: 'soldier' | 'turret',
  x: number,
  y: number,
): Enemy {
  return {
    x,
    y,
    w: type === 'turret' ? 30 : 22,
    h: type === 'turret' ? 26 : 36,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: -1,
    alive: true,
    hp: type === 'turret' ? 3 : 1,
    fireTimer: Math.random() * 1.5,
    range: [x - 120, x + 120],
    homeX: x,
    type,
  }
}

export function makeBoss(
  type: 'mech' | 'fortress',
  x: number,
  y: number,
  stage: number,
): Boss {
  const hp = type === 'mech' ? 40 + stage * 10 : 80 + stage * 20
  return {
    x,
    y,
    w: type === 'mech' ? 90 : 140,
    h: type === 'mech' ? 120 : 100,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: -1,
    alive: true,
    hp,
    maxHp: hp,
    type,
    phase: 0,
    fireTimer: 1,
    pattern: 0,
  }
}

/** AABB 碰撞检测。 */
export function aabb(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

/** 瓦片坐标转世界坐标。 */
export function tileToWorld(tx: number, ty: number) {
  return { x: tx * TILE, y: ty * TILE }
}

/** 检测实体在某位置是否与实心瓦片重叠。 */
export function collideTiles(
  state: GameState,
  e: Entity,
): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
  const hit = { left: false, right: false, top: false, bottom: false }
  const tiles = state.tiles
  const minTx = Math.floor(e.x / TILE)
  const maxTx = Math.floor((e.x + e.w - 1) / TILE)
  const minTy = Math.floor(e.y / TILE)
  const maxTy = Math.floor((e.y + e.h - 1) / TILE)
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (ty < 0 || ty >= tiles.length) continue
      if (tx < 0 || tx >= tiles[0].length) continue
      if (tiles[ty][tx] !== 1) continue
      const tw = tileToWorld(tx, ty)
      if (aabb(e, { x: tw.x, y: tw.y, w: TILE, h: TILE })) {
        // 简化：判断主要重叠方向
        const overlapX = Math.min(e.x + e.w - tw.x, tw.x + TILE - e.x)
        const overlapY = Math.min(e.y + e.h - tw.y, tw.y + TILE - e.y)
        if (overlapY < overlapX) {
          if (e.y + e.h / 2 < tw.y + TILE / 2) {
            hit.bottom = true
            e.y = tw.y - e.h
            e.vy = 0
            e.onGround = true
          } else {
            hit.top = true
            e.y = tw.y + TILE
            e.vy = 0
          }
        } else {
          if (e.x + e.w / 2 < tw.x + TILE / 2) {
            hit.right = true
            e.x = tw.x - e.w
            e.vx = 0
          } else {
            hit.left = true
            e.x = tw.x + TILE
            e.vx = 0
          }
        }
      }
    }
  }
  return hit
}

/** 发射子弹。 */
export function fireBullet(
  state: GameState,
  x: number,
  y: number,
  dir: number,
  weapon: WeaponType,
  from: 'player' | 'enemy',
) {
  if (weapon === 'S') {
    // 散射：3 发扇形
    for (const ang of [-0.25, 0, 0.25]) {
      state.bullets.push({
        x,
        y,
        vx: dir * BULLET_SPEED * Math.cos(ang),
        vy: BULLET_SPEED * Math.sin(ang),
        w: 10,
        h: 4,
        from,
        type: weapon,
        life: 1.2,
      })
    }
  } else if (weapon === 'L') {
    state.bullets.push({
      x,
      y,
      vx: dir * BULLET_SPEED * 1.8,
      vy: 0,
      w: 28,
      h: 6,
      from,
      type: weapon,
      life: 0.8,
    })
  } else {
    state.bullets.push({
      x,
      y,
      vx: dir * BULLET_SPEED,
      vy: 0,
      w: 12,
      h: 4,
      from,
      type: weapon,
      life: 1.5,
    })
  }
}

/** 敌人 AI 更新。 */
export function updateEnemy(state: GameState, e: Enemy, dt: number) {
  if (!e.alive) return
  const p = state.player

  // 重力
  if (!e.onGround) e.vy += GRAVITY * dt
  e.onGround = false

  if (e.type === 'soldier') {
    // 巡逻
    if (e.x < e.range[0]) e.facing = 1
    if (e.x > e.range[1]) e.facing = -1
    e.vx = e.facing * 50
    // 看到玩家时射击
    const dx = p.x - e.x
    const dy = p.y - e.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 420 && Math.abs(dy) < 80) {
      e.facing = dx > 0 ? 1 : -1
      e.vx = 0
      e.fireTimer -= dt
      if (e.fireTimer <= 0) {
        e.fireTimer = 1.2 + Math.random() * 0.8
        fireBullet(state, e.x + (e.facing > 0 ? e.w : 0), e.y + e.h / 2, e.facing, 'R', 'enemy')
      }
    }
  } else if (e.type === 'turret') {
    e.vx = 0
    e.facing = p.x > e.x ? 1 : -1
    e.fireTimer -= dt
    if (e.fireTimer <= 0 && Math.abs(p.x - e.x) < 500) {
      e.fireTimer = 2.0
      fireBullet(state, e.x + e.w / 2, e.y, e.facing, 'R', 'enemy')
    }
  }

  e.x += e.vx * dt
  e.y += e.vy * dt
  collideTiles(state, e)

  // 接触伤害
  if (p.alive && p.invuln <= 0 && aabb(p, e)) {
    damagePlayer(state)
  }
}

/** Boss AI 更新。 */
export function updateBoss(state: GameState, b: Boss, dt: number) {
  if (!b.alive) return
  const p = state.player
  b.fireTimer -= dt

  // 阶段切换
  const hpRatio = b.hp / b.maxHp
  b.phase = hpRatio > 0.66 ? 0 : hpRatio > 0.33 ? 1 : 2

  if (b.type === 'mech') {
    // 左右缓慢移动
    b.vx = Math.sin(state.time * 0.5) * 40
    b.facing = p.x > b.x ? 1 : -1
    if (b.fireTimer <= 0) {
      b.fireTimer = b.phase === 0 ? 1.5 : b.phase === 1 ? 1.0 : 0.7
      // 扇形弹幕
      const baseAng = b.facing > 0 ? 0 : Math.PI
      for (const off of [-0.4, -0.2, 0, 0.2, 0.4]) {
        state.bullets.push({
          x: b.x + b.w / 2,
          y: b.y + 30,
          vx: BULLET_SPEED * 0.7 * Math.cos(baseAng + off),
          vy: BULLET_SPEED * 0.7 * Math.sin(baseAng + off),
          w: 12,
          h: 12,
          from: 'enemy',
          type: 'R',
          life: 3,
        })
      }
    }
  } else {
    // fortress boss：固定，弹幕更密
    b.facing = p.x > b.x ? 1 : -1
    if (b.fireTimer <= 0) {
      b.fireTimer = b.phase === 0 ? 1.2 : b.phase === 1 ? 0.8 : 0.5
      // 螺旋弹幕
      const ang = state.time * 3
      for (let i = 0; i < 6; i++) {
        const a = ang + (i / 6) * Math.PI * 2
        state.bullets.push({
          x: b.x + b.w / 2,
          y: b.y + b.h / 2,
          vx: BULLET_SPEED * 0.6 * Math.cos(a),
          vy: BULLET_SPEED * 0.6 * Math.sin(a),
          w: 12,
          h: 12,
          from: 'enemy',
          type: 'R',
          life: 4,
        })
      }
    }
  }

  // 重力
  if (!b.onGround) b.vy += GRAVITY * dt
  b.onGround = false
  b.x += b.vx * dt
  b.y += b.vy * dt
  collideTiles(state, b)

  // 接触伤害
  if (p.alive && p.invuln <= 0 && aabb(p, b)) {
    damagePlayer(state)
  }
}

/** 玩家受伤。 */
export function damagePlayer(state: GameState) {
  state.player.invuln = 1.5
  state.lives -= 1
  state.player.x -= state.player.facing * 30
  state.player.vy = -200
  if (state.lives <= 0) {
    state.player.alive = false
  }
}

/** 子弹更新。 */
export function updateBullets(state: GameState, dt: number) {
  const alive: Bullet[] = []
  for (const b of state.bullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.life -= dt
    if (b.life <= 0) continue
    // 出界
    if (b.x < state.cameraX - 100 || b.x > state.cameraX + 1000) continue
    if (b.y < -50 || b.y > state.levelHeight + 50) continue
    // 碰瓦片
    const tx = Math.floor(b.x / TILE)
    const ty = Math.floor(b.y / TILE)
    if (
      ty >= 0 &&
      ty < state.tiles.length &&
      tx >= 0 &&
      tx < state.tiles[0].length &&
      state.tiles[ty][tx] === 1
    ) {
      // 击中地形
      spawnParticles(state, b.x, b.y, '#aaa', 3)
      continue
    }
    // 碰实体
    if (b.from === 'player') {
      let hit = false
      for (const e of state.enemies) {
        if (!e.alive) continue
        if (aabb(b, e)) {
          e.hp -= 1
          spawnParticles(state, b.x, b.y, '#ff6b3d', 4)
          hit = true
          break
        }
      }
      if (hit) {
        continue
      }
      if (state.boss && state.boss.alive && aabb(b, state.boss)) {
        state.boss.hp -= 1
        spawnParticles(state, b.x, b.y, '#ff6b3d', 4)
        if (state.boss.hp <= 0) {
          state.boss.alive = false
          state.score += 500
          state.cleared = true
          spawnParticles(state, state.boss.x + state.boss.w / 2, state.boss.y + state.boss.h / 2, '#ffd166', 30)
        }
        if (b.type !== 'L') continue
      }
    } else {
      // 敌方子弹
      if (state.player.alive && state.player.invuln <= 0 && aabb(b, state.player)) {
        damagePlayer(state)
        continue
      }
    }
    alive.push(b)
  }
  state.bullets = alive
}

/** 拾取物更新。 */
export function updatePickups(state: GameState, _dt: number) {
  for (const p of state.pickups) {
    if (p.collected) continue
    if (state.player.alive && aabb(state.player, p)) {
      p.collected = true
      state.player.weapon = p.weapon
    }
  }
}

/** 粒子生成。 */
export function spawnParticles(
  state: GameState,
  x: number,
  y: number,
  color: string,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 200,
      vy: (Math.random() - 0.5) * 200 - 50,
      life: 0.3 + Math.random() * 0.4,
      color,
      size: 2 + Math.random() * 3,
    })
  }
}

/** 粒子更新。 */
export function updateParticles(state: GameState, dt: number) {
  const alive: Particle[] = []
  for (const p of state.particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += GRAVITY * 0.5 * dt
    p.life -= dt
    if (p.life > 0) alive.push(p)
  }
  state.particles = alive
}
