import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { useGameKeys } from '../shared/useGameKeys'
import { toast } from '../../stores/toast'
import shared from '../shared/game.module.css'
import styles from './Contra.module.css'
import {
  collideTiles,
  damagePlayer,
  FIRE_COOLDOWN,
  fireBullet,
  GRAVITY,
  JUMP_VEL,
  MOVE_SPEED,
  TILE,
  updateBullets,
  updateBoss,
  updateEnemy,
  updateParticles,
  updatePickups,
  type GameState,
  type WeaponType,
} from './contraLogic'
import { LEVELS, buildLevel } from './levels'
import { loadBackgrounds, type BgLayer } from './sprites'
import {
  drawBoss,
  drawBullet,
  drawCapsule,
  drawSoldier,
  drawTurret,
  type AnimState,
} from './pixelSprites'

const W = 960
const H = 540

export default function ContraGame({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [stage, setStage] = useState(1)
  const [hudWeapon, setHudWeapon] = useState<WeaponType>('R')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState | null>(null)
  const bgsRef = useRef<BgLayer[]>(loadBackgrounds())
  const inputRef = useRef({ left: false, right: false, jump: false, fire: false })
  const statusRef = useRef(status)
  statusRef.current = status
  const scoreRef = useRef(0)
  const livesRef = useRef(3)
  const stageRef = useRef(1)
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  const finalScoreRef = useRef(0)

  const startGame = useCallback(() => {
    const s = buildLevel(LEVELS[0], 1, 0, 3)
    stateRef.current = s
    setScore(0)
    setLives(3)
    setStage(1)
    setHudWeapon('R')
    scoreRef.current = 0
    livesRef.current = 3
    stageRef.current = 1
    finalScoreRef.current = 0
    setStatus('running')
  }, [])

  const togglePause = useCallback(() => {
    setStatus((s) => (s === 'running' ? 'paused' : s === 'paused' ? 'running' : s))
  }, [])

  // 键盘
  useGameKeys({
    arrowleft: () => (inputRef.current.left = true),
    a: () => (inputRef.current.left = true),
    arrowright: () => (inputRef.current.right = true),
    d: () => (inputRef.current.right = true),
    arrowup: () => (inputRef.current.jump = true),
    w: () => (inputRef.current.jump = true),
    ' ': () => (inputRef.current.jump = true),
    z: () => (inputRef.current.fire = true),
    j: () => (inputRef.current.fire = true),
    p: togglePause,
  })

  // 键松开（keyup 不被 useGameKeys 捕获，需要单独监听）
  useEffect(() => {
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'arrowleft' || k === 'a') inputRef.current.left = false
      if (k === 'arrowright' || k === 'd') inputRef.current.right = false
      if (k === 'arrowup' || k === 'w' || k === ' ') inputRef.current.jump = false
      if (k === 'z' || k === 'j') inputRef.current.fire = false
    }
    window.addEventListener('keyup', up)
    return () => window.removeEventListener('keyup', up)
  }, [])

  const tick = useCallback((dt: number) => {
    const s = stateRef.current
    if (!s) return
    s.time += dt
    const p = s.player

    if (p.alive) {
      // 输入
      if (inputRef.current.left) {
        p.vx = -MOVE_SPEED
        p.facing = -1
      } else if (inputRef.current.right) {
        p.vx = MOVE_SPEED
        p.facing = 1
      } else {
        p.vx = 0
      }
      // 跳跃
      if (inputRef.current.jump && p.onGround) {
        p.vy = -JUMP_VEL
        p.onGround = false
      }
      // 射击
      p.fireTimer -= dt
      if (inputRef.current.fire && p.fireTimer <= 0) {
        p.fireTimer = FIRE_COOLDOWN
        const bx = p.facing > 0 ? p.x + p.w : p.x
        fireBullet(s, bx, p.y + p.h / 2 - 2, p.facing, p.weapon, 'player')
      }
      // 无敌
      if (p.invuln > 0) p.invuln -= dt
    }

    // 物理
    p.vy += GRAVITY * dt
    p.onGround = false
    p.x += p.vx * dt
    p.y += p.vy * dt
    collideTiles(s, p)

    // 掉出屏幕底部
    if (p.y > s.levelHeight + 50) {
      damagePlayer(s)
      if (s.player.alive) {
        // 重生
        p.x = Math.max(64, s.cameraX + 64)
        p.y = 64
        p.vy = 0
      }
    }

    // 相机跟随
    const targetCam = Math.max(0, Math.min(p.x - W * 0.35, s.levelWidth - W))
    s.cameraX += (targetCam - s.cameraX) * Math.min(1, dt * 6)

    // 敌人
    for (const e of s.enemies) updateEnemy(s, e, dt)
    // 仅更新屏幕内敌人
    // Boss
    if (s.boss && s.boss.alive) {
      // 当玩家接近 Boss 位置时触发
      if (!s.bossTriggered && p.x > s.boss.x - 400) {
        s.bossTriggered = true
      }
      if (s.bossTriggered) updateBoss(s, s.boss, dt)
    }
    // 子弹
    updateBullets(s, dt)
    // 拾取
    updatePickups(s, dt)
    // 粒子
    updateParticles(s, dt)

    // 清理死亡敌人
    s.enemies = s.enemies.filter((e) => e.alive && e.hp > 0)

    // 武器更新到 HUD
    if (p.weapon !== hudWeaponRef.current) {
      hudWeaponRef.current = p.weapon
      setHudWeapon(p.weapon)
      const names: Record<WeaponType, string> = { R: '默认弹', S: '散射弹', L: '激光' }
      toast(`武器升级：${names[p.weapon]}！`, 'success')
    }

    // 分数同步
    if (s.score !== scoreRef.current) {
      scoreRef.current = s.score
      setScore(s.score)
    }
    if (s.lives !== livesRef.current) {
      livesRef.current = s.lives
      setLives(s.lives)
    }

    // 玩家死亡
    if (!p.alive && s.lives <= 0 && finalScoreRef.current === 0) {
      finalScoreRef.current = s.score
      setScore(s.score)
      setStatus('over')
      gameOverRef.current(s.score)
      return
    }

    // 重生
    if (!p.alive && s.lives > 0) {
      p.alive = true
      p.hp = 1
      p.invuln = 2
      p.x = Math.max(64, s.cameraX + 64)
      p.y = 64
      p.vx = 0
      p.vy = 0
    }

    // 关卡清除（Boss 击败）
    if (s.cleared) {
      s.score += stageRef.current * 1000
      scoreRef.current = s.score
      setScore(s.score)
      const nextStage = stageRef.current + 1
      if (nextStage > LEVELS.length) {
        // 全部通关
        finalScoreRef.current = s.score
        setStatus('over')
        gameOverRef.current(s.score)
        return
      }
      // 下一关
      stageRef.current = nextStage
      setStage(nextStage)
      const ns = buildLevel(LEVELS[nextStage - 1], nextStage, s.score, s.lives)
      ns.player.weapon = p.weapon
      stateRef.current = ns
      toast(`第 ${nextStage} 关：${LEVELS[nextStage - 1].name}`, 'info')
    }
  }, [])

  const hudWeaponRef = useRef(hudWeapon)
  hudWeaponRef.current = hudWeapon

  // 渲染
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const s = stateRef.current
    if (!s) return
    const cam = Math.floor(s.cameraX)

    // 背景：视差层
    for (let i = bgsRef.current.length - 1; i >= 0; i--) {
      const bg = bgsRef.current[i]
      if (!bg.img.complete || bg.img.naturalWidth === 0) continue
      const scrollX = -cam * bg.parallax
      const iw = bg.img.naturalWidth
      const ih = bg.img.naturalHeight
      // 拉伸覆盖屏幕高度，水平平铺
      const drawH = H
      const drawW = (iw / ih) * drawH
      let startX = scrollX % drawW
      if (startX > 0) startX -= drawW
      for (let x = startX; x < W; x += drawW) {
        ctx.drawImage(bg.img, x, 0, drawW, drawH)
      }
    }

    // 平移到相机
    ctx.save()
    ctx.translate(-cam, 0)

    // 瓦片（Contra 风格地形）
    const minTx = Math.floor(cam / TILE)
    const maxTx = Math.floor((cam + W) / TILE) + 1
    for (let ty = 0; ty < s.tiles.length; ty++) {
      for (let tx = Math.max(0, minTx); tx <= Math.min(maxTx, s.tiles[0].length - 1); tx++) {
        if (s.tiles[ty][tx] !== 1) continue
        const wx = tx * TILE
        const wy = ty * TILE

        // 主体
        ctx.fillStyle = '#2a4028'
        ctx.fillRect(wx, wy, TILE, TILE)

        // 顶部草皮（深绿渐变）
        ctx.fillStyle = '#3a6838'
        ctx.fillRect(wx, wy, TILE, 4)
        ctx.fillStyle = '#4a7a48'
        ctx.fillRect(wx, wy, TILE, 2)

        // 侧面阴影（左暗右亮）
        ctx.fillStyle = '#1a2818'
        ctx.fillRect(wx, wy, 2, TILE)
        ctx.fillStyle = '#3a5838'
        ctx.fillRect(wx + TILE - 2, wy, 2, TILE)

        // 纹理（砖块/石块细节）
        ctx.fillStyle = '#223822'
        ctx.fillRect(wx + 4, wy + 8, 8, 4)
        ctx.fillRect(wx + 16, wy + 14, 8, 4)
        ctx.fillRect(wx + 8, wy + 20, 12, 3)

        // 底部泥土
        ctx.fillStyle = '#4a3020'
        ctx.fillRect(wx, wy + TILE - 4, TILE, 4)
        ctx.fillStyle = '#3a2818'
        ctx.fillRect(wx, wy + TILE - 2, TILE, 2)

        // 草尖
        ctx.fillStyle = '#5a8a58'
        for (let g = 0; g < TILE; g += 6) {
          ctx.fillRect(wx + g + 1, wy - 1, 2, 2)
        }
      }
    }

    // 拾取物（武器胶囊）
    for (const pk of s.pickups) {
      if (pk.collected) continue
      ctx.save()
      ctx.globalAlpha = Math.sin(s.time * 4) * 0.15 + 0.85
      drawCapsule(ctx, pk.x, pk.y, pk.weapon, s.time, 1.2)
      ctx.restore()
    }

    // 敌人
    for (const e of s.enemies) {
      if (!e.alive) continue
      const anim: AnimState = e.vx !== 0 ? 'walk' : 'idle'
      if (e.type === 'turret') {
        drawTurret(ctx, e.x, e.y, e.facing, s.time, 1.5)
      } else {
        drawSoldier(ctx, e.x, e.y, e.facing, anim, s.time, 'enemy', 1.6)
      }
      // HP 条
      if (e.hp > 1) {
        const maxHp = e.type === 'turret' ? 3 : 1
        ctx.fillStyle = '#300'
        ctx.fillRect(e.x, e.y - 6, e.w, 3)
        ctx.fillStyle = '#f33'
        ctx.fillRect(e.x, e.y - 6, (e.w * e.hp) / maxHp, 3)
      }
    }

    // Boss
    if (s.boss && s.boss.alive && s.bossTriggered) {
      const b = s.boss
      drawBoss(ctx, b.x, b.y, b.facing, s.time, b.type, b.type === 'mech' ? 2.5 : 2.2)
      // 血条
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(b.x - 2, b.y - 14, b.w + 4, 8)
      ctx.fillStyle = '#300'
      ctx.fillRect(b.x, b.y - 12, b.w, 6)
      ctx.fillStyle = '#f33'
      ctx.fillRect(b.x, b.y - 12, (b.w * b.hp) / b.maxHp, 6)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.strokeRect(b.x, b.y - 12, b.w, 6)
    }

    // 玩家
    const p = s.player
    if (p.alive) {
      const flicker = p.invuln > 0 && Math.floor(s.time * 20) % 2 === 0
      if (!flicker) {
        const anim: AnimState = !p.onGround
          ? 'jump'
          : Math.abs(p.vx) > 10
            ? 'walk'
            : inputRef.current.fire
              ? 'shoot'
              : 'idle'
        drawSoldier(ctx, p.x, p.y, p.facing, anim, s.time, 'player', 1.8)
      }
    }

    // 子弹
    for (const b of s.bullets) {
      const type = b.from === 'player' ? b.type : 'enemy'
      drawBullet(ctx, b.x, b.y, b.w, b.h, type)
    }

    // 粒子
    for (const pt of s.particles) {
      ctx.globalAlpha = Math.max(0, pt.life)
      ctx.fillStyle = pt.color
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size)
    }
    ctx.globalAlpha = 1

    ctx.restore()

    // CRT 扫描线效果（NES 复古感）
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    for (let y = 0; y < H; y += 2) {
      ctx.fillRect(0, y, W, 1)
    }

    // 暗角效果
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.35)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Boss 提示
    if (s.boss && s.bossTriggered && s.boss.alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(W / 2 - 80, 40, 160, 32)
      ctx.strokeStyle = '#f40'
      ctx.lineWidth = 2
      ctx.strokeRect(W / 2 - 80, 40, 160, 32)
      ctx.fillStyle = '#ff6b3d'
      ctx.font = 'bold 18px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⚠ BOSS ⚠', W / 2, 56)
    }
  }, [])

  // 游戏循环
  useEffect(() => {
    if (status !== 'running') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    let last = performance.now()
    let acc = 0
    const STEP = 1 / 60

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min((ts - last) / 1000, 0.25)
      last = ts
      acc += dt
      while (acc >= STEP) {
        acc -= STEP
        tick(STEP)
      }
      draw(ctx)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [status, tick, draw])

  const weaponNames: Record<WeaponType, string> = { R: '默认弹', S: '散射', L: '激光' }

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>分数</span>
          <span className={shared.hudValue}>{score}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>生命</span>
          <span className={shared.hudValue}>{'❤'.repeat(Math.max(0, lives))}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>关卡</span>
          <span className={shared.hudValue}>{stage}/{LEVELS.length}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>武器</span>
          <span className={shared.hudValue}>{weaponNames[hudWeapon]}</span>
        </div>
      </div>

      <div className={`${shared.stage} ${styles.stage}`} style={{ maxWidth: `min(${W}px, 100%)`, aspectRatio: `${W} / ${H}` }}>
        <canvas
          ref={canvasRef}
          width={W * 2}
          height={H * 2}
          className={styles.canvas}
        />
        <GameOverlay
          status={status}
          score={score}
          scoreLabel="最终得分"
          onStart={startGame}
          onResume={() => setStatus('running')}
          onRestart={startGame}
          idleTitle="魂斗罗"
          idleHint="← → 移动，↑/空格 跳跃，J/Z 射击。击败 Boss 通关！"
        />
      </div>

      <div className={shared.touchBar}>
        <button
          type="button"
          className={shared.touchBtn}
          onPointerDown={() => (inputRef.current.left = true)}
          onPointerUp={() => (inputRef.current.left = false)}
          onPointerLeave={() => (inputRef.current.left = false)}
        >
          ←
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          onPointerDown={() => (inputRef.current.right = true)}
          onPointerUp={() => (inputRef.current.right = false)}
          onPointerLeave={() => (inputRef.current.right = false)}
        >
          →
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          onPointerDown={() => (inputRef.current.jump = true)}
          onPointerUp={() => (inputRef.current.jump = false)}
          onPointerLeave={() => (inputRef.current.jump = false)}
        >
          ⤴ 跳
        </button>
        <button
          type="button"
          className={shared.touchBtn}
          onPointerDown={() => (inputRef.current.fire = true)}
          onPointerUp={() => (inputRef.current.fire = false)}
          onPointerLeave={() => (inputRef.current.fire = false)}
        >
          🔫
        </button>
      </div>
    </div>
  )
}
