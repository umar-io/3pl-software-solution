import type { ReactNode } from 'react'
import type { Variance } from '../../types/inventory'
import { formatAgeHours, formatQty } from '../../lib/inventoryFormat'
import { Difference, ReviewStatusPill, SeverityBadge } from './Badges'

/** Stacked, touch-friendly stand-in for a variance table row on small screens. */
export function VarianceCard({
  variance: v,
  onClick,
  action,
  showStatus = false,
}: {
  variance: Variance
  onClick?: () => void
  action?: ReactNode
  showStatus?: boolean
}) {
  // A div, not a button: the card can contain its own action button.
  const interactive = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            onClick()
          }
        },
      }
    : {}
  return (
    <div
      {...interactive}
      className={`block w-full px-4 py-3.5 text-left ${onClick ? 'cursor-pointer transition active:bg-slate-50' : ''} ${v.status === 'resolved' ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{v.sku}</div>
          <div className="truncate text-xs text-slate-500">{v.product}</div>
        </div>
        <SeverityBadge severity={v.severity} />
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-sm">
        <Metric label="Expected">{formatQty(v.expected)}</Metric>
        <Metric label="Actual">{formatQty(v.actual)}</Metric>
        <Metric label="Diff">
          <Difference value={v.difference} />
        </Metric>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span className="min-w-0 truncate">
          {v.client} · {v.location}
        </span>
        <span className="shrink-0 tabular-nums">{formatAgeHours(v.age_hours)}</span>
      </div>

      {(showStatus || action) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {showStatus ? <ReviewStatusPill status={v.status} /> : <span />}
          {action}
        </div>
      )}
      {showStatus && v.note && (
        <div className="mt-1.5 truncate text-xs italic text-slate-400">“{v.note}”</div>
      )}
    </div>
  )
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 tabular-nums text-slate-900">{children}</div>
    </div>
  )
}
