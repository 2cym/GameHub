/**
 * 画布后备存储的倍率。
 *
 * canvas 的 width/height 属性（后备存储像素数）必须和 ctx.setTransform 用的
 * dpr 保持一致：后备存储是 `W * 2` 而 transform 用真实 dpr 时，dpr=1 的桌面
 * 上游戏只会画进画布的左半边。上限 2 是为了不让 3x 屏把内存和填充率翻三倍。
 */
export function canvasDpr(): number {
  if (typeof window === 'undefined') return 1
  return Math.min(window.devicePixelRatio || 1, 2)
}
