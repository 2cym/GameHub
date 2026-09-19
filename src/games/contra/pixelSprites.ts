/**
 * 魂斗罗风格像素精灵系统
 * 用 fillRect 逐像素绘制 NES Contra 风格角色，带动画
 */

export interface SpriteColors {
  outline: string
  cap: string
  skin: string
  eye: string
  uniform: string
  uniformDark: string
  accent: string
  boots: string
  gun: string
  metal: string
  metalDark: string
  core: string
}

const PLAYER_COLORS: SpriteColors = {
  outline: '#1a1a2e',
  cap: '#2d6b30',
  skin: '#e8c8a0',
  eye: '#0a0a0a',
  uniform: '#2a5d9f',
  uniformDark: '#1a3d6f',
  accent: '#c0392b',
  boots: '#0a0a0a',
  gun: '#1a1a1a',
  metal: '#444',
  metalDark: '#222',
  core: '#ff4444',
}

const ENEMY_COLORS: SpriteColors = {
  outline: '#1a1a2e',
  cap: '#444444',
  skin: '#d8a878',
  eye: '#1a0a0a',
  uniform: '#8b1a1a',
  uniformDark: '#5b0a0a',
  accent: '#ffd166',
  boots: '#0a0a0a',
  gun: '#1a1a1a',
  metal: '#444',
  metalDark: '#222',
  core: '#ff6b3d',
}

export type AnimState = 'idle' | 'walk' | 'jump' | 'shoot' | 'dead'

export function drawSoldier(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  anim: AnimState,
  time: number,
  scheme: 'player' | 'enemy',
  scale = 1.8,
) {
  const C = scheme === 'player' ? PLAYER_COLORS : ENEMY_COLORS
  const s = scale

  ctx.save()
  ctx.translate(x, y)
  if (facing < 0) ctx.scale(-1, 1)

  const p = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(dx * s, dy * s, w * s, h * s)
  }

  if (anim === 'dead') {
    // 倒地：横躺
    p(0, 10, 20, 4, C.uniform)
    p(0, 10, 4, 4, C.boots)
    p(16, 10, 4, 4, C.skin)
    p(18, 11, 2, 1, C.eye)
    p(4, 9, 10, 1, C.cap)
    ctx.restore()
    return
  }

  // 腿（动画）
  let legA = 0
  let legB = 0
  if (anim === 'walk') {
    const t = Math.sin(time * 10)
    legA = t > 0 ? 1 : 0
    legB = t > 0 ? 0 : 1
  } else if (anim === 'jump') {
    legA = 2
    legB = 2
  }

  // 左腿
  p(3, 18 + legA, 4, 3, C.uniform)
  p(3, 21 + legA, 4, 2, C.boots)
  // 右腿
  p(11 - legB, 18 - legB, 4, 3, C.uniform)
  p(11 - legB, 21 - legB, 4, 2, C.boots)

  // 腰部/皮带
  p(2, 17, 12, 1, C.accent)

  // 躯干
  p(2, 10, 12, 7, C.uniform)
  // 胸前装饰
  p(5, 11, 2, 3, C.uniformDark)

  // 手臂
  p(1, 10, 1, 6, C.uniformDark)
  p(14, 10, 1, 6, C.uniformDark)
  // 右手握枪
  p(15, 11, 1, 4, C.uniformDark)
  p(16, 12, 2, 2, C.uniformDark)

  // 枪
  p(18, 12, 4, 1, C.gun)
  p(18, 13, 4, 1, C.gun)
  p(22, 12, 1, 1, C.gun)

  // 肩章
  p(2, 10, 1, 1, C.accent)
  p(13, 10, 1, 1, C.accent)

  // 脖子
  p(5, 8, 6, 1, C.skin)

  // 脸
  p(4, 5, 10, 3, C.skin)
  // 眼睛
  p(7, 6, 2, 1, C.eye)
  p(11, 6, 2, 1, C.eye)

  // 帽子
  p(3, 3, 12, 2, C.cap)
  p(4, 2, 10, 1, C.cap)
  p(5, 1, 8, 1, C.cap)
  p(6, 0, 6, 1, C.cap)
  // 帽檐
  p(2, 4, 12, 1, C.cap)

  // 枪口火光
  if (anim === 'shoot') {
    const flash = Math.floor(time * 20) % 2
    if (flash) {
      p(23, 11, 2, 3, '#ffdd00')
      p(24, 12, 2, 1, '#ffffff')
      p(25, 11, 1, 1, '#ff8800')
      p(25, 13, 1, 1, '#ff8800')
    }
  }

  ctx.restore()
}

export function drawTurret(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  time: number,
  scale = 1.5,
) {
  const C = ENEMY_COLORS
  const s = scale

  ctx.save()
  ctx.translate(x, y)
  if (facing < 0) ctx.scale(-1, 1)

  const p = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(dx * s, dy * s, w * s, h * s)
  }

  // 基座
  p(2, 16, 12, 2, C.metalDark)
  p(3, 15, 10, 1, C.metalDark)

  // 底座
  p(3, 12, 10, 3, C.metal)
  p(4, 11, 8, 1, C.metal)

  // 炮塔旋转部分
  const angle = Math.sin(time * 2) * 0.3
  ctx.save()
  ctx.translate(8 * s, 10 * s)
  ctx.rotate(angle)

  // 炮塔
  ctx.fillStyle = C.metal
  ctx.fillRect(-4 * s, -4 * s, 8 * s, 5 * s)
  // 炮塔顶
  ctx.fillStyle = C.metalDark
  ctx.fillRect(-3 * s, -5 * s, 6 * s, 1 * s)
  // 炮管
  ctx.fillStyle = C.gun
  ctx.fillRect(4 * s, -2 * s, 8 * s, 2 * s)
  // 炮管口
  ctx.fillStyle = C.metalDark
  ctx.fillRect(11 * s, -3 * s, 2 * s, 4 * s)
  // 核心（红点）
  ctx.fillStyle = C.core
  const pulse = Math.sin(time * 4) > 0 ? 1 : 0
  if (pulse) {
    ctx.fillRect(-1 * s, -3 * s, 2 * s, 2 * s)
  }

  ctx.restore()

  // 基座铆钉
  p(3, 12, 1, 1, C.metalDark)
  p(12, 12, 1, 1, C.metalDark)
  p(3, 14, 1, 1, C.metalDark)
  p(12, 14, 1, 1, C.metalDark)

  ctx.restore()
}

export function drawBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  time: number,
  bossType: 'mech' | 'fortress',
  scale = 2,
) {
  const s = scale

  ctx.save()
  ctx.translate(x, y)
  if (facing < 0) ctx.scale(-1, 1)

  const p = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(dx * s, dy * s, w * s, h * s)
  }

  if (bossType === 'mech') {
    // ---- 机甲 Boss（类 Contra 机甲）----
    // 双腿
    p(5, 25, 8, 8, '#333')
    p(18, 25, 8, 8, '#333')
    p(5, 32, 8, 2, '#222')
    p(18, 32, 8, 2, '#222')

    // 躯干
    p(3, 12, 24, 14, '#444')
    p(5, 14, 20, 10, '#555')
    // 装甲板
    p(7, 16, 16, 2, '#666')
    p(7, 20, 16, 2, '#333')

    // 核心（红/黄脉动）
    const corePulse = Math.sin(time * 5) > 0
    const coreColor = corePulse ? '#ff2222' : '#ffaa00'
    p(12, 18, 6, 6, coreColor)
    p(13, 19, 4, 4, corePulse ? '#ffff00' : '#ff6600')

    // 左臂
    p(0, 14, 3, 8, '#444')
    p(0, 14, 3, 2, '#555')
    // 右臂（持炮）
    p(27, 14, 3, 8, '#444')
    p(27, 14, 3, 2, '#555')

    // 主炮（右侧）
    p(30, 17, 8, 4, '#333')
    p(30, 17, 8, 1, '#444')
    p(37, 16, 3, 6, '#222')
    p(38, 18, 2, 2, corePulse ? '#ff0' : '#f60')

    // 左炮（下）
    p(30, 22, 6, 3, '#333')
    p(35, 22, 2, 3, '#222')

    // 头顶天线
    p(13, 8, 2, 4, '#333')
    p(14, 7, 1, 1, '#f00')
    p(15, 8, 2, 4, '#333')

    // 肩膀装甲
    p(1, 12, 4, 2, '#666')
    p(27, 12, 4, 2, '#666')

    // 铆钉
    p(4, 13, 1, 1, '#666')
    p(25, 13, 1, 1, '#666')
    p(4, 24, 1, 1, '#666')
    p(25, 24, 1, 1, '#666')

    // 烟雾/火焰（底部）
    const smoke = Math.sin(time * 8) > 0
    if (smoke) {
      p(6, 33, 2, 1, 'rgba(100,100,100,0.5)')
      p(19, 33, 2, 1, 'rgba(100,100,100,0.5)')
    }
  } else {
    // ---- 基地 Boss（巨型堡垒）----
    // 主体
    p(0, 10, 40, 20, '#4a3030')
    p(2, 12, 36, 16, '#5a4040')

    // 装甲纹路
    p(2, 12, 36, 1, '#3a2020')
    p(2, 26, 36, 1, '#3a2020')

    // 炮塔阵列（顶部）
    for (let i = 0; i < 4; i++) {
      const tx = 4 + i * 9
      p(tx, 7, 6, 4, '#444')
      p(tx + 1, 5, 4, 2, '#555')
      p(tx + 2, 3, 2, 2, '#333')
    }

    // 核心（中心大门）
    const corePulse = Math.sin(time * 4) > 0
    const coreColor = corePulse ? '#ff2222' : '#cc0000'
    p(16, 16, 8, 8, coreColor)
    p(18, 18, 4, 4, corePulse ? '#ffaa00' : '#ff4400')

    // 侧翼炮台
    p(0, 18, 3, 6, '#333')
    p(-3, 20, 3, 2, '#222')
    p(40, 18, 3, 6, '#333')
    p(43, 20, 3, 2, '#222')

    // 底部履带
    p(0, 30, 40, 4, '#222')
    p(2, 32, 36, 2, '#333')
    // 履带轮
    for (let i = 0; i < 8; i++) {
      p(3 + i * 5, 33, 2, 2, '#444')
    }

    // 铆钉
    for (let i = 0; i < 6; i++) {
      p(4 + i * 7, 13, 1, 1, '#3a2020')
      p(4 + i * 7, 26, 1, 1, '#3a2020')
    }

    // 顶部天线
    p(19, 2, 2, 5, '#333')
    const blink = Math.sin(time * 3) > 0
    if (blink) p(20, 1, 1, 1, '#f00')

    // 火焰喷射口
    const fire = Math.sin(time * 6) > 0
    if (fire) {
      p(17, 17, 2, 1, '#ff6600')
      p(21, 17, 2, 1, '#ff6600')
    }
  }

  ctx.restore()
}

/** 绘制武器胶囊（Contra 风格的药丸胶囊） */
export function drawCapsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  weapon: 'S' | 'L' | 'R',
  time: number,
  scale = 1.5,
) {
  const s = scale
  const bob = Math.sin(time * 3) * 2

  ctx.save()
  ctx.translate(x, y + bob)

  // 胶囊体
  const capColor = weapon === 'S' ? '#ff3333' : weapon === 'L' ? '#3399ff' : '#ffcc00'
  const capDark = weapon === 'S' ? '#aa0000' : weapon === 'L' ? '#0055aa' : '#aa8800'

  // 主体
  ctx.fillStyle = capColor
  ctx.fillRect(2 * s, 2 * s, 14 * s, 8 * s)
  // 上半
  ctx.fillStyle = capDark
  ctx.fillRect(2 * s, 2 * s, 14 * s, 3 * s)
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillRect(3 * s, 3 * s, 4 * s, 1 * s)

  // 标签背景
  ctx.fillStyle = '#fff'
  ctx.fillRect(6 * s, 4 * s, 6 * s, 4 * s)
  // 标签文字
  ctx.fillStyle = capDark
  ctx.font = `bold ${10 * s}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(weapon, 9 * s, 6 * s)

  // 两侧环
  ctx.fillStyle = '#fff'
  ctx.fillRect(1 * s, 4 * s, 1 * s, 4 * s)
  ctx.fillRect(16 * s, 4 * s, 1 * s, 4 * s)

  // 闪光效果
  const flash = Math.sin(time * 6) > 0.5
  if (flash) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(0, 0, 18 * s, 12 * s)
  }

  ctx.restore()
}

/** 绘制 NES 风格子弹 */
export function drawBullet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  type: 'R' | 'S' | 'L' | 'enemy',
) {
  if (type === 'L') {
    // 激光：蓝色光束带辉光
    ctx.fillStyle = 'rgba(0,255,255,0.3)'
    ctx.fillRect(x - 4, y - 2, w + 8, h + 4)
    ctx.fillStyle = '#0ff'
    ctx.fillRect(x, y - 1, w, h + 2)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x + w * 0.3, y, w * 0.4, h)
  } else if (type === 'S') {
    // 散射弹：红色
    ctx.fillStyle = '#f44'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#faa'
    ctx.fillRect(x + 1, y, w - 2, 1)
  } else if (type === 'R') {
    // 默认弹：黄色
    ctx.fillStyle = '#ff0'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#ff8'
    ctx.fillRect(x, y, w, 1)
  } else {
    // 敌方弹：橙红
    ctx.fillStyle = '#f40'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#fa0'
    ctx.fillRect(x + 1, y, w - 2, 1)
  }
}
