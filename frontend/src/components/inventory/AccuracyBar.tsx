import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProgressBar } from '../ui/Progress'
import { HEALTH_TONE, bandForAccuracy, formatPct } from '../../lib/inventoryFormat'
import type { BreakdownRow } from '../../types/inventory'

/** One clickable accuracy row; drills into the exception queue for that group. */
export function AccuracyRow({
  row,
  to,
  compact = false,
}: {
  row: BreakdownRow
  to: string
  compact?: boolean
}) {
  const tone = HEALTH_TONE[bandForAccuracy(row.accuracy_pct)]
  return (
    <Link
      to={to}
      className={`group block rounded-lg transition hover:bg-slate-50 ${compact ? '-mx-2 px-2 py-2' : 'px-4 py-4 sm:px-5'}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-slate-900">{row.name}</span>
        <span className={`text-sm font-semibold tabular-nums ${tone.text}`}>
          {formatPct(row.accuracy_pct, 1)}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={row.accuracy_pct} label={`${row.name} accuracy`} showMarkers />
      </div>
      {!compact && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            {row.lines} stock lines ·{' '}
            {row.variances === 0 ? (
              'no open variances'
            ) : (
              <>
                {row.variances} open variance{row.variances === 1 ? '' : 's'}
                {row.critical > 0 && (
                  <span className="font-medium text-red-600"> ({row.critical} critical)</span>
                )}
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-0.5 font-medium text-brand-600 transition sm:opacity-0 sm:group-hover:opacity-100">
            View variances <ChevronRight size={13} />
          </span>
        </div>
      )}
    </Link>
  )
}
