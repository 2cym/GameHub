import type { DailyPlayTime } from '../../lib/api'

/**
 * 每日游玩时长柱状图。手写 SVG。
 * 稀疏的日期由 windowStart/today 补成连续区间，没有记录的日子显示为 0 高度，
 * 这样能看出「断更」而不是把柱子挤到一起。
 */
interface BarChartProps {
  /** 只含有记录的日期，不必连续 */
  days: DailyPlayTime[]
  /** 窗口起点（含），YYYY-MM-DD */
  windowStart: string
  /** 今天，YYYY-MM-DD */
  today: string
}

const W = 340
const H = 172
const PAD_L = 46
const PAD_R = 12
const PAD_T = 14
const PAD_B = 28

function niceMax(value: number): number {
  if (value <= 1) return 1
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  const m = value / base
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10
  return step * base
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h === 0) return `${m} 分钟`
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`
}

/** 把 YYYY-MM-DD 序列化成连续日期数组，避免用 Date 解析造成的时区偏移 */
function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T23:59:59Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
    if (out.length > 400) break
  }
  return out
}

function fmtDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  })
}

export function BarChart({ days, windowStart, today }: BarChartProps) {
  const byDate = new Map(days.map((d) => [d.date, d.total]))
  const dates = dateRange(windowStart, today)
  if (dates.length === 0) return null

  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const yMax = niceMax(Math.max(...dates.map((d) => byDate.get(d) ?? 0), 1))

  const step = plotW / dates.length
  const barW = Math.max(2, Math.min(14, step * 0.62))
  const xAt = (i: number) => PAD_L + i * step + step / 2
  const yAt = (seconds: number) => PAD_T + (1 - seconds / yMax) * plotH

  const ticks = [0, 0.5, 1].map((r) => ({ y: PAD_T + (1 - r) * plotH, value: yMax * r }))

  const playedCount = dates.filter((d) => (byDate.get(d) ?? 0) > 0).length

  return (
    <svg
      className="barChart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`近 ${dates.length} 天共 ${playedCount} 天有游玩记录，单日最长 ${fmtDuration(Math.max(...dates.map((d) => byDate.get(d) ?? 0)))}`}
    >
      <defs>
        <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--primary)" />
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
          <text x={PAD_L - 8} y={tick.y + 3.5} textAnchor="end" className="chartAxisText">
            {Math.round(tick.value).toLocaleString()}
          </text>
        </g>
      ))}

      {dates.map((date, i) => {
        const seconds = byDate.get(date) ?? 0
        const y = yAt(seconds)
        const h = PAD_T + plotH - y
        return (
          <g key={date}>
            {seconds > 0 ? (
              <rect
                x={xAt(i) - barW / 2}
                y={y}
                width={barW}
                height={h}
                rx="2"
                fill="url(#barFill)"
              >
                <title>{`${date}：${fmtDuration(seconds)}`}</title>
              </rect>
            ) : (
              <rect x={xAt(i) - barW / 2} y={PAD_T + plotH - 1} width={barW} height="1" fill="var(--border-strong)" />
            )}
            {i % 5 === 0 && (
              <text x={xAt(i)} y={H - 8} textAnchor="middle" className="chartAxisText">
                {fmtDay(date)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export { fmtDuration }
