// 生成 PWA 图标（icon-192.png / icon-512.png），与 public/favicon.svg 视觉一致。
// 零依赖：PNG 手写编码（Node 自带 zlib），图形用 SDF 采样 + 4x4 超采样抗锯齿。
// iOS 要求 apple-touch-icon 是 PNG，Chrome 的装机提示要 512 位图，所以不能只给 SVG。
// 用法：node scripts/gen-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// 全部坐标都在 favicon.svg 的 64x64 viewBox 里描述
const BG = [11, 14, 26] // #0b0e1a
const G0 = [0x7c, 0x5c, 0xff] // #7c5cff
const G1 = [0x00, 0xe5, 0xff] // #00e5ff
const PINK = [0xff, 0x5c, 0xa8]
const GOLD = [0xff, 0xd1, 0x66]

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a, b, t) => a + (b - a) * t
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

// 对角线性渐变，对应 SVG 的 x1=0 y1=0 x2=1 y2=1（作用在 x=4..60, y=4..60 上）
function gradient(px, py) {
  const t = clamp01(((px - 4) / 56 + (py - 4) / 56) / 2)
  return mix(G0, G1, t)
}

function sdRoundRect(px, py, cx, cy, hx, hy, r) {
  const dx = Math.abs(px - cx) - (hx - r)
  const dy = Math.abs(py - cy) - (hy - r)
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r
}

function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : clamp01(((px - ax) * vx + (py - ay) * vy) / len2)
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
}

// SVG 的 "M24 44 c6 -5 16 -5 22 0" = 三次贝塞尔
const SMILE = [
  [24, 44],
  [30, 39],
  [40, 39],
  [46, 44],
]
const SMILE_SAMPLES = 48
const smilePts = Array.from({ length: SMILE_SAMPLES + 1 }, (_, i) => {
  const t = i / SMILE_SAMPLES
  const u = 1 - t
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return [
    SMILE[0][0] * w[0] + SMILE[1][0] * w[1] + SMILE[2][0] * w[2] + SMILE[3][0] * w[3],
    SMILE[0][1] * w[0] + SMILE[1][1] * w[1] + SMILE[2][1] * w[2] + SMILE[3][1] * w[3],
  ]
})

function sdSmile(px, py) {
  let best = Infinity
  for (let i = 0; i < SMILE_SAMPLES; i++) {
    const [ax, ay] = smilePts[i]
    const [bx, by] = smilePts[i + 1]
    best = Math.min(best, sdSegment(px, py, ax, ay, bx, by))
  }
  return best
}

// 采样一个 64x64 空间里的点，返回 straight RGBA
function sample(px, py) {
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  // Porter-Duff source over。r/g/b 是预乘累加，a 是总覆盖。
  // 注意不能把权重截断到 (1 - a)：底色是不透明的，那样后面所有图形都会被挡住。
  const over = (c, weight) => {
    const w = Math.min(Math.max(weight, 0), 1)
    if (w <= 0) return
    const keep = 1 - w
    r = c[0] * w + r * keep
    g = c[1] * w + g * keep
    b = c[2] * w + b * keep
    a = w + a * keep
  }

  // 深色底 + 渐变描边（描边比填充略内缩，避免最外圈被裁）
  if (sdRoundRect(px, py, 32, 32, 28, 28, 14) < 0.5) over(BG, 1)
  const ring = Math.abs(sdRoundRect(px, py, 32, 32, 27, 27, 13))
  if (ring < 1.5) over(gradient(px, py), 1.5 - ring)

  // 青色 X（手柄按键）
  const cross = Math.min(sdSegment(px, py, 22, 26, 26, 34), sdSegment(px, py, 26, 26, 22, 34))
  if (cross < 1.75) over(G1, 1.75 - cross)

  // 两个动作键
  const d1 = Math.hypot(px - 40, py - 28) - 2.6
  if (d1 < 1) over(PINK, 1 - d1)
  const d2 = Math.hypot(px - 46, py - 33) - 2.6
  if (d2 < 1) over(GOLD, 1 - d2)

  // 渐变微笑
  const arc = sdSmile(px, py)
  if (arc < 1.75) over(gradient(px, py), 1.75 - arc)

  if (a <= 0) return [0, 0, 0, 0]
  return [r / a, g / a, b / a, a]
}

const SS = 4
function render(size) {
  const big = size * SS
  const inv = 64 / big
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = sample((x * SS + sx + 0.5) * inv, (y * SS + sy + 0.5) * inv)
          r += pr
          g += pg
          b += pb
          a += pa
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      rgba[o] = Math.round(r / n)
      rgba[o + 1] = Math.round(g / n)
      rgba[o + 2] = Math.round(b / n)
      // r/g/b 累积的是 0..255 的颜色加权和；a 累积的是 0..1 的权重和，需要换成 8 位
      rgba[o + 3] = Math.round((a / n) * 255)
    }
  }
  return rgba
}

// ---------- PNG 编码 ----------

let CRC_TABLE = null
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([head, typeBuf, data, crc])
}

function encodePNG(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (stride + 1)
    raw[row] = 0 // filter: none
    rgba.copy(raw, row + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, encodePNG(size, render(size)))
  console.log(`wrote ${file}`)
}
