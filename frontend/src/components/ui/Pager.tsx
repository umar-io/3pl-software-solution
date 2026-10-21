import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Controls'

export function Pager({
  total,
  limit,
  offset,
  onChange,
  noun = 'items',
}: {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
  noun?: string
}) {
  if (total <= limit) {
    return total > 0 ? (
      <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
        {total} {noun}
      </div>
    ) : null
  }
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
      <span className="text-sm text-slate-500">
        {from}–{to} of {total} {noun}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          icon={<ChevronLeft size={14} />}
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          size="sm"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}
