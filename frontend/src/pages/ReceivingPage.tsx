import { CircleCheck, Clock, ScanBarcode, TriangleAlert } from 'lucide-react'
import { SyncIndicator } from '../components/inventory/SyncIndicator'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/Progress'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { useAsync } from '../hooks/useAsync'
import { useSyncAction } from '../hooks/useSyncAction'
import { inventoryApi } from '../lib/inventoryApi'
import {
  HEALTH_TONE,
  bandForAccuracy,
  formatPct,
  formatQty,
  timeAgo,
} from '../lib/inventoryFormat'
import type { HighVelocitySku, Receipt } from '../types/inventory'

export function ReceivingPage() {
  const state = useAsync((signal) => inventoryApi.receiving(signal), [], 60_000)
  const { sync, syncing } = useSyncAction(state.reload)
  const data = state.data

  return (
    <>
      <PageHeader
        title="Receiving & cycle counts"
        subtitle={`Inbound accuracy and count coverage over the last ${data?.window_days ?? 30} days.`}
        actions={
          <SyncIndicator
            syncedAt={data?.last_synced_at}
            refreshing={syncing || state.refreshing}
            onRefresh={sync}
          />
        }
      />

      {state.error && !data ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-10">
          <section aria-labelledby="receiving-heading" className="space-y-6">
            <h2 id="receiving-heading" className="text-base font-semibold text-slate-900">
              Receiving
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <MetricCard
                label="Receipts confirmed correctly"
                value={formatPct(data.receiving.confirmed_pct)}
                progress={data.receiving.confirmed_pct}
                hint={`${data.receiving.confirmed} of ${data.receiving.completed} completed receipts matched the order`}
              />
              <MetricCard
                label="Potential blind receipts"
                value={String(data.receiving.blind_receipts)}
                icon={<ScanBarcode size={16} />}
                tone={data.receiving.blind_receipts > 0 ? 'warn' : 'ok'}
                hint="No PO or partner reference on the receipt"
              />
              <MetricCard
                label="Quantity mismatches"
                value={String(data.receiving.mismatches)}
                icon={<TriangleAlert size={16} />}
                tone={data.receiving.mismatches > 0 ? 'warn' : 'ok'}
                hint={`${data.receiving.pending} receipts still awaiting arrival`}
              />
            </div>
            <ReceiptsTable receipts={data.receiving.recent} />
          </section>

          <section aria-labelledby="count-heading" className="space-y-6">
            <h2 id="count-heading" className="text-base font-semibold text-slate-900">
              Cycle counting
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <MetricCard
                label="High-velocity SKUs counted recently"
                value={formatPct(data.cycle_count.high_velocity_pct)}
                progress={data.cycle_count.high_velocity_pct}
                hint={`${data.cycle_count.high_velocity_counted} of ${data.cycle_count.high_velocity_total} fastest-moving SKUs`}
              />
              <MetricCard
                label="Overall count coverage"
                value={formatPct(data.cycle_count.coverage_pct)}
                progress={data.cycle_count.coverage_pct}
                hint={`${data.cycle_count.skus_counted} of ${data.cycle_count.skus_tracked} SKUs counted in ${data.window_days} days`}
              />
            </div>
            <HighVelocityList items={data.cycle_count.high_velocity} />
          </section>
        </div>
      )}
    </>
  )
}

function MetricCard({
  label,
  value,
  hint,
  progress,
  icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  progress?: number | null
  icon?: React.ReactNode
  tone?: 'ok' | 'warn'
}) {
  const valueColor =
    progress != null
      ? HEALTH_TONE[bandForAccuracy(progress)].text
      : tone === 'warn'
        ? 'text-amber-700'
        : 'text-slate-900'
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-3 text-3xl font-semibold leading-none tracking-tight tabular-nums sm:text-[32px] ${valueColor}`}>
        {value}
      </div>
      {progress != null && (
        <div className="mt-4">
          <ProgressBar value={progress} label={label} showMarkers />
        </div>
      )}
      <p className="mt-3 text-sm text-slate-500">{hint}</p>
    </Card>
  )
}

const RECEIPT_STATE: Record<string, string> = {
  draft: 'Draft',
  waiting: 'Waiting',
  confirmed: 'Waiting',
  assigned: 'Ready',
  done: 'Received',
}

function ReceiptsTable({ receipts }: { receipts: Receipt[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Recent receipts" subtitle="Most recent first" />
      {receipts.length === 0 ? (
        <EmptyState title="No receipts in this window" />
      ) : (
        <>
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 md:hidden">
          {receipts.map((r) => (
            <li key={r.id} className="space-y-2 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{r.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {r.partner ?? 'No supplier'} · {r.origin ?? 'No reference'}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{RECEIPT_STATE[r.state] ?? r.state}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="tabular-nums text-slate-600">
                  {formatQty(r.received_qty)} / {formatQty(r.ordered_qty)} units
                </span>
                <ReceiptFlag receipt={r} />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5 font-medium">Receipt</th>
                <th className="px-3 py-2.5 font-medium">Supplier · Reference</th>
                <th className="px-3 py-2.5 font-medium">State</th>
                <th className="px-3 py-2.5 text-right font-medium">Ordered</th>
                <th className="px-3 py-2.5 text-right font-medium">Received</th>
                <th className="px-5 py-2.5 font-medium">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.map((r) => (
                <tr key={r.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{r.name}</td>
                  <td className="px-3 py-3">
                    <div className="text-slate-800">{r.partner ?? <span className="text-slate-400">No supplier</span>}</div>
                    <div className="text-xs text-slate-500">{r.origin ?? 'No reference'}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{RECEIPT_STATE[r.state] ?? r.state}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatQty(r.ordered_qty)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-900">{formatQty(r.received_qty)}</td>
                  <td className="px-5 py-3"><ReceiptFlag receipt={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Card>
  )
}

function ReceiptFlag({ receipt }: { receipt: Receipt }) {
  const base = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset'
  if (receipt.blind) {
    return <span className={`${base} bg-amber-50 text-amber-800 ring-amber-600/20`}><ScanBarcode size={12} /> Possible blind receipt</span>
  }
  if (receipt.mismatch) {
    return <span className={`${base} bg-red-50 text-red-700 ring-red-600/20`}><TriangleAlert size={12} /> Qty mismatch</span>
  }
  if (receipt.confirmed) {
    return <span className={`${base} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}><CircleCheck size={12} /> Confirmed</span>
  }
  return <span className={`${base} bg-slate-100 text-slate-600 ring-slate-500/20`}><Clock size={12} /> Awaiting arrival</span>
}

function HighVelocityList({ items }: { items: HighVelocitySku[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="High-velocity SKUs"
        subtitle="Fastest-moving items by units ordered — these drift out of sync first"
      />
      {items.length === 0 ? (
        <EmptyState title="No recent order activity" body="Velocity is calculated from confirmed orders." />
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {items.map((item) => (
            <li key={item.sku} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">
                  {item.sku} <span className="font-normal text-slate-500">· {item.product}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {item.client} · {formatQty(item.units_30d)} units ordered
                </div>
              </div>
              {item.counted ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                  <CircleCheck size={15} /> Counted {timeAgo(item.last_counted_at)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  <Clock size={12} /> Count due
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
