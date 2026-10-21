import { useId, useState } from 'react'
import type { TrendPoint } from '../../types/inventory'
import { formatShortDate } from '../../lib/inventoryFormat'

const W = 320
const H = 72
const PAD = 6

export function TrendSparkline({ points, stroke }: { points: TrendPoint[]; stroke: string }) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length < 2) {
    return (
      <p className="text-sm text-slate-400">
        Trend appears once two daily snapshots have been recorded.
      </p>
    )
  }

  const scores = points.map((p) => p.score)
  const min = Math.min(...scores) - 2
  const max = Math.max(...scores) + 2
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2)

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`
  const active = hover ?? points.length - 1
  const point = points[active]

  return (
    <div
      className="relative"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = (event.clientX - rect.left) / rect.width
        setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={x(active)}
          x2={x(active)}
          y1={0}
          y2={H}
          stroke="#cbd5e1"
          strokeDasharray="3 3"
          opacity={hover == null ? 0 : 1}
        />
        <circle cx={x(active)} cy={y(point.score)} r="4" fill="#fff" stroke={stroke} strokeWidth="2" />
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{formatShortDate(points[0].date)}</span>
        <span className="font-medium text-slate-700 tabular-nums">
          {formatShortDate(point.date)} · {point.score.toFixed(1)}
        </span>
        <span>{formatShortDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  )
}
