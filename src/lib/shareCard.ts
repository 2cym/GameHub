/**
 * 把一局成绩画成一张可以发出去的图片（1200×630，社交卡片标准比例）。
 *
 * 全部用 Canvas 2D 画，不引第三方图片库；字体用系统栈，避免等字体下载才出图。
 * 返回 Blob 而不是 dataURL：dataURL 是 base64 字符串，2MB 量级的图会让
 * 内存里多一份 27% 膨胀的副本。
 */

const CARD_W = 1200
const CARD_H = 630
const DPR = 2

const FONT = `'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, -apple-system, sans-serif`

export interface ShareCardOpts {
  gameEmoji: string
  gameName: string
  score: number
  username: string
  best: number
  challengeUrl: string
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** 把字号一路调小直到文本放得下给定宽度 */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  startPx: number,
  minPx: number,
): number {
  for (let px = startPx; px >= minPx; px -= 1) {
    ctx.font = `600 ${px}px ${FONT}`
    if (ctx.measureText(text).width <= maxW) return px
  }
  return minPx
}

export async function drawShareCard(opts: ShareCardOpts): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W * DPR
  canvas.height = CARD_H * DPR
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2D context 不可用')
  ctx.scale(DPR, DPR)

  // 底色 + 两团光晕
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
  bg.addColorStop(0, '#1a2038')
  bg.addColorStop(1, '#0b0e1a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  const glowA = ctx.createRadialGradient(180, 120, 20, 180, 120, 520)
  glowA.addColorStop(0, 'rgba(124, 92, 255, 0.5)')
  glowA.addColorStop(1, 'rgba(124, 92, 255, 0)')
  ctx.fillStyle = glowA
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  const glowB = ctx.createRadialGradient(CARD_W - 120, CARD_H - 60, 20, CARD_W - 120, CARD_H - 60, 560)
  glowB.addColorStop(0, 'rgba(0, 229, 255, 0.28)')
  glowB.addColorStop(1, 'rgba(0, 229, 255, 0)')
  ctx.fillStyle = glowB
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 游戏头像
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  roundRect(ctx, 72, 64, 96, 96, 24)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.lineWidth = 2
  roundRect(ctx, 72, 64, 96, 96, 24)
  ctx.stroke()

  ctx.font = `52px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(opts.gameEmoji, 120, 114)

  // 游戏名 + 平台名
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#eef1fb'
  ctx.font = `700 40px ${FONT}`
  ctx.fillText(opts.gameName, 196, 112)

  ctx.fillStyle = 'rgba(238, 241, 251, 0.55)'
  ctx.font = `500 22px ${FONT}`
  ctx.fillText('GameHub · 游戏成绩', 196, 146)

  // 分割线
  const line = ctx.createLinearGradient(72, 0, 1128, 0)
  line.addColorStop(0, 'rgba(124, 92, 255, 0)')
  line.addColorStop(0.5, 'rgba(124, 92, 255, 0.45)')
  line.addColorStop(1, 'rgba(0, 229, 255, 0)')
  ctx.fillStyle = line
  ctx.fillRect(72, 200, 1056, 2)

  // 主分数
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(238, 241, 251, 0.6)'
  ctx.font = `500 30px ${FONT}`
  ctx.fillText('本局得分', CARD_W / 2, 268)

  const scoreText = opts.score.toLocaleString('en-US')
  const scorePx = fitFontSize(ctx, scoreText, 900, 200, 90)
  ctx.font = `800 ${scorePx}px ${FONT}`
  const grad = ctx.createLinearGradient(0, 300, 0, 430)
  grad.addColorStop(0, '#ffe9a8')
  grad.addColorStop(1, '#ffc93c')
  ctx.fillStyle = grad
  ctx.shadowColor = 'rgba(255, 201, 60, 0.45)'
  ctx.shadowBlur = 40
  ctx.fillText(scoreText, CARD_W / 2, 410)
  ctx.shadowBlur = 0

  // 个人最好 + 玩家名
  const subText =
    opts.best > 0 && opts.best >= opts.score
      ? `个人最好 ${opts.best.toLocaleString('en-US')}  ·  ${opts.username}`
      : opts.best > 0
        ? `🎉 刷新个人纪录！ ·  ${opts.username}`
        : opts.username
  ctx.font = `500 28px ${FONT}`
  ctx.fillStyle = 'rgba(238, 241, 251, 0.78)'
  ctx.fillText(subText, CARD_W / 2, 468)

  // 底部挑战链接
  ctx.font = `500 20px ${FONT}`
  ctx.fillStyle = 'rgba(238, 241, 251, 0.4)'
  ctx.fillText('点击下方链接向我发起挑战', CARD_W / 2, 528)

  const urlText = opts.challengeUrl
  ctx.textAlign = 'center'
  const urlPx = fitFontSize(ctx, urlText, 1040, 30, 16)
  ctx.font = `600 ${urlPx}px ${FONT}`
  ctx.fillStyle = '#6fe6ff'
  ctx.fillText(urlText, CARD_W / 2, 578)

  ctx.textAlign = 'left'

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas 导出失败'))),
      'image/png',
      0.95,
    )
  })
}

/** 下载 blob，走浏览器原生下载流程 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟回收，给下载引擎一点时间读取
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 把图片塞进剪贴板；不支持 ClipboardItem 的环境返回 false 让调用方降级 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}
