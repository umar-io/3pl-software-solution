import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

const TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  danger: 'bg-red-50 text-red-600',
  warn: 'bg-amber-50 text-amber-600',
  info: 'bg-brand-50 text-brand-600',
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  to,
}: {
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  tone?: keyof typeof TONES
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-slate-500 sm:text-sm">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold sm:mt-3 sm:text-[32px] leading-none tracking-tight text-slate-900 tabular-nums">
        {value}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500 sm:text-sm">
        <span>{hint}</span>
        {to && (
          <ArrowUpRight
            size={15}
            className="text-slate-300 transition group-hover:text-brand-600"
          />
        )}
      </div>
    </>
  )
  const base = 'group block rounded-card border border-slate-200 bg-white p-4 shadow-card sm:p-5'
  return to ? (
    <Link
      to={to}
      className={`${base} transition hover:-translate-y-px hover:border-slate-300 hover:shadow-raised`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  )
}
