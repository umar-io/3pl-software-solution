import { useSearchParams } from 'react-router-dom'
import { AccuracyRow } from '../components/inventory/AccuracyBar'
import { SyncIndicator } from '../components/inventory/SyncIndicator'
import { Card, PageHeader } from '../components/ui/Card'
import { Segmented } from '../components/ui/Controls'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { useAsync } from '../hooks/useAsync'
import { useSyncAction } from '../hooks/useSyncAction'
import { inventoryApi } from '../lib/inventoryApi'
import { HEALTH_TONE, bandForAccuracy, formatPct } from '../lib/inventoryFormat'

type GroupBy = 'client' | 'location'

export function AccuracyPage() {
  const [params, setParams] = useSearchParams()
  const groupBy: GroupBy = params.get('by') === 'location' ? 'location' : 'client'

  const breakdown = useAsync(
    (signal) => inventoryApi.breakdown(groupBy, signal),
    [groupBy],
    60_000
  )
  const { sync, syncing } = useSyncAction(breakdown.reload)
  const data = breakdown.data
  const below = data?.rows.filter((r) => r.accuracy_pct < 90).length ?? 0

  return (
    <>
      <PageHeader
        title="Accuracy breakdown"
        subtitle="Where the mismatches are concentrated. Select a row to see its variances."
        actions={
          <SyncIndicator
            syncedAt={data?.last_synced_at}
            refreshing={syncing || breakdown.refreshing}
            onRefresh={sync}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5 sm:gap-4">
        <Segmented<GroupBy>
          label="Group by"
          value={groupBy}
          onChange={(value) => setParams(value === 'client' ? {} : { by: value }, { replace: true })}
          options={[
            { value: 'client', label: 'By client' },
            { value: 'location', label: 'By location' },
          ]}
        />
        <Legend />
      </div>

      {breakdown.error && !data ? (
        <ErrorState message={breakdown.error} onRetry={breakdown.reload} />
      ) : !data ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : data.rows.length === 0 ? (
        <Card>
          <EmptyState title="No stock found" body="Odoo returned no internal stock lines." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          <Card className="divide-y divide-slate-100 py-1 xl:col-span-3">
            {data.rows.map((row) => (
              <AccuracyRow
                key={row.name}
                row={row}
                to={`/exceptions?${groupBy}=${encodeURIComponent(row.name)}`}
              />
            ))}
          </Card>

          <Card className="h-fit p-5">
            <div className="text-sm font-medium text-slate-500">Overall accuracy</div>
            <div
              className={`mt-2 text-4xl font-semibold tracking-tight tabular-nums ${HEALTH_TONE[bandForAccuracy(data.overall_accuracy_pct)].text}`}
            >
              {formatPct(data.overall_accuracy_pct, 1)}
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {below === 0
                ? `Every ${groupBy} is at or above 90%.`
                : `${below} of ${data.rows.length} ${groupBy === 'client' ? 'clients' : 'locations'} below the 90% target.`}
            </p>
            <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-400">
              Accuracy blends how many stock lines match Odoo (weighted by severity) with how
              many units are off.
            </p>
          </Card>
        </div>
      )}
    </>
  )
}

function Legend() {
  const items = [
    { band: 'good', label: '90%+' },
    { band: 'attention', label: '75–90%' },
    { band: 'critical', label: 'Below 75%' },
  ] as const
  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      {items.map((item) => (
        <span key={item.band} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${HEALTH_TONE[item.band].dot}`} />
          {item.label}
        </span>
      ))}
    </div>
  )
}
