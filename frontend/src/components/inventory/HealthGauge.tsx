import { useEffect, useState } from 'react'
import type { HealthStatus } from '../../types/inventory'
import { HEALTH_LABEL, HEALTH_TONE } from '../../lib/inventoryFormat'

const SIZE = 184
const STROKE = 14
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function HealthGauge({ score, status }: { score: number; status: HealthStatus }) {
  const tone = HEALTH_TONE[status]
  // Animate from empty on mount so the ring "fills in" for the demo.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score))
    return () => cancelAnimationFrame(id)
  }, [score])

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Inventory health score ${score} out of 100, ${HEALTH_LABEL[status]}`}
        className="-rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#eef2f6"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - shown / 100)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
          {score.toFixed(0)}
        </span>
        <span className="mt-1 text-xs font-medium text-slate-400">out of 100</span>
      </div>
    </div>
  )
}
