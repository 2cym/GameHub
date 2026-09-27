import type { ScoreProgressPoint } from '../../lib/api'

/**
 * 成绩进步曲线。手写 SVG，不加图表库。
 * scores 表只在破纪录时写入，所以折线本身就是单调不降的进步轨迹。
 */
interface TrendChartProps {
  points: ScoreProgressPoint[]
  /** 分数单位，只出现在 aria 描述里 */
  unit?: string
}

const W = 340
const H = 172
const PAD_L = 46
const PAD_R = 12
const PAD_T = 14
const PAD_B = 28

/** 把最大值取整到 1/2/5×10^n，让 Y 轴刻度看着干净 */
function niceMax(value: number): number {
  if (value <= 1) return 1
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  const m = value / base
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10
  return step * base
}

function fmtDay(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function TrendChart({ points, unit = '分' }: TrendChartProps) {
  if (points.length === 0) return null

  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const yMax = niceMax(Math.max(...points.map((p) => p.score), 1))

  const xAt = (i: number) =>
    points.length === 1 ? PAD_L + plotW / 2 : PAD_L + (i / (points.length - 1)) * plotW
  const yAt = (score: number) => PAD_T + (1 - score / yMax) * plotH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.score).toFixed(1)}`)
    .join(' ')
  const area = `${path} L${xAt(points.length - 1).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`

  // Y 轴 3 档刻度；最大值按 locale 显示，避免大分数变成科学计数
  const ticks = [0, 0.5, 1].map((r) => ({ y: PAD_T + (1 - r) * plotH, value: yMax * r }))
  const fmt = (n: number) => Math.round(n).toLocaleString()

  const first = points[0]
  const last = points[points.length - 1]

  return (
    <svg
      className="trendChart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`成绩从 ${fmt(first.score)} ${unit}（${fmtDay(first.t)}）进步到 ${fmt(last.score)} ${unit}（${fmtDay(last.t)}），共 ${points.length} 次破纪录`}
    >
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((tick) => (
        <g key={tick.y}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={tick.y}
            y2={tick.y}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray={tick.value === 0 ? undefined : '3 4'}
          />
          <text x={PAD_L - 8} y={tick.y + 3.5} textAnchor="end" className="trendAxisText">
            {fmt(tick.value)}
          </text>
        </g>
      ))}

      {points.length > 1 && <path d={area} fill="url(#trendFill)" />}
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <circle key={`${p.t}-${i}`} cx={xAt(i)} cy={yAt(p.score)} r="3.4" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5">
          <title>{`${fmtDay(p.t)}：${fmt(p.score)} ${unit}`}</title>
        </circle>
      ))}

      <text x={PAD_L} y={H - 8} textAnchor="start" className="trendAxisText">
        {fmtDay(first.t)}
      </text>
      {points.length > 1 && (
        <text x={W - PAD_R} y={H - 8} textAnchor="end" className="trendAxisText">
          {fmtDay(last.t)}
        </text>
      )}
    </svg>
  )
}
