import { RefreshCw } from 'lucide-react'
import { useNow } from '../../hooks/useNow'
import { STATIC_DEMO } from '../../lib/demo'
import { formatShortDate } from '../../lib/inventoryFormat'
import { timeAgo } from '../../lib/inventoryFormat'

const STALE_AFTER_MS = 10 * 60 * 1000

export function SyncIndicator({
  syncedAt,
  refreshing,
  onRefresh,
}: {
  syncedAt: string | null | undefined
  refreshing: boolean
  onRefresh: () => void
}) {
  const now = useNow()
  if (STATIC_DEMO) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span>
          Demo snapshot
          {syncedAt && <span className="font-medium text-slate-700"> · {formatShortDate(syncedAt)}</span>}
        </span>
      </div>
    )
  }
  const stale = syncedAt ? now - new Date(syncedAt).getTime() > STALE_AFTER_MS : false

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="relative flex h-2 w-2">
          {!stale && !refreshing && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-emerald-500'}`}
          />
        </span>
        <span>
          <span className="hidden sm:inline">Last synced with Odoo</span>
          <span className="sm:hidden">Synced</span>{' '}
          <span className="font-medium text-slate-700">{timeAgo(syncedAt, now)}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Sync with Odoo now"
        title="Sync with Odoo now"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-60"
      >
        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
