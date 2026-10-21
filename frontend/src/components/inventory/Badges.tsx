import { CheckCircle2, CircleDashed, Search } from 'lucide-react'
import type { ReviewStatus, Severity } from '../../types/inventory'
import { REVIEW_LABEL, SEVERITY_LABEL } from '../../lib/inventoryFormat'

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-red-50 text-red-700 ring-red-600/20',
  moderate: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  minor: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}
const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-red-500',
  moderate: 'bg-amber-500',
  minor: 'bg-slate-400',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SEVERITY_STYLE[severity]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
      {SEVERITY_LABEL[severity]}
    </span>
  )
}

const STATUS_STYLE: Record<ReviewStatus, string> = {
  open: 'text-slate-600',
  investigated: 'text-brand-700',
  resolved: 'text-emerald-700',
}

export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  const Icon = status === 'resolved' ? CheckCircle2 : status === 'investigated' ? Search : CircleDashed
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium ${STATUS_STYLE[status]}`}
    >
      <Icon size={14} />
      {REVIEW_LABEL[status]}
    </span>
  )
}

/** Signed difference, red for shortages and amber for overages. */
export function Difference({ value }: { value: number }) {
  const color = value < 0 ? 'text-red-600' : 'text-amber-600'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      {sign}
      {Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}
    </span>
  )
}
