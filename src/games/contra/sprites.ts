/**
 * 精灵图加载：仅加载背景视差层（完整场景图，无需帧裁剪）。
 * 玩家/敌人/子弹用程序化绘制，避免对未知精灵表帧格逆向。
 */

export interface BgLayer {
  img: HTMLImageElement
  /** 滚动速率（0=固定背景，1=跟前景同步） */
  parallax: number
}

const loaded: Record<string, HTMLImageElement> = {}

export function loadImage(src: string): HTMLImageElement {
  if (loaded[src]) return loaded[src]
  const img = new Image()
  img.src = src
  loaded[src] = img
  return img
}

/** 加载视差背景层（4 层）。 */
export function loadBackgrounds(): BgLayer[] {
  return [
    { img: loadImage('/contra/bg1.png'), parallax: 0.75 },
    { img: loadImage('/contra/bg2.png'), parallax: 0.5 },
    { img: loadImage('/contra/bg3.png'), parallax: 0.25 },
    { img: loadImage('/contra/bg4.png'), parallax: 0.125 },
  ]
}

/** 预加载全部背景，返回是否就绪。 */
export function backgroundsReady(bgs: BgLayer[]): boolean {
  return bgs.every((b) => b.img.complete && b.img.naturalWidth > 0)
}
