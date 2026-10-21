import { AlertOctagon, CalendarClock, Layers, RefreshCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AccuracyRow } from '../components/inventory/AccuracyBar'
import { HealthGauge } from '../components/inventory/HealthGauge'
import { StatTile } from '../components/inventory/StatTile'
import { SyncIndicator } from '../components/inventory/SyncIndicator'
import { TopMismatches } from '../components/inventory/TopMismatches'
import { TrendSparkline } from '../components/inventory/TrendSparkline'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { ErrorState, Skeleton } from '../components/ui/States'
import { useAsync } from '../hooks/useAsync'
import { useNow } from '../hooks/useNow'
import { useSyncAction } from '../hooks/useSyncAction'
import { inventoryApi } from '../lib/inventoryApi'
import { STATIC_DEMO } from '../lib/demo'
import { HEALTH_LABEL, HEALTH_TONE, formatPct, formatShortDate, timeAgo } from '../lib/inventoryFormat'

const POLL_MS = 60_000

export function DashboardPage() {
  const health = useAsync((signal) => inventoryApi.health(signal), [], POLL_MS)
  const clients = useAsync((signal) => inventoryApi.breakdown('client', signal), [], POLL_MS)
  const now = useNow()

  const reloadAll = () => {
    health.reload()
    clients.reload()
  }
  const { sync, syncing } = useSyncAction(reloadAll)
  const data = health.data

  return (
    <>
      <PageHeader
        title="Inventory health"
        subtitle="How closely Odoo’s stock records match what is physically on the shelf."
        actions={
          <SyncIndicator
            syncedAt={data?.last_synced_at}
            refreshing={syncing || health.refreshing}
            onRefresh={sync}
          />
        }
      />

      {health.error && !data ? (
        <ErrorState message={health.error} onRetry={reloadAll} />
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-5 sm:space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-5">
            <Card className="p-5 sm:p-6 xl:col-span-2">
              <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:gap-6 sm:text-left">
                <HealthGauge score={data.score} status={data.status} />
                <div className="min-w-0">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${HEALTH_TONE[data.status].soft}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_TONE[data.status].dot}`} />
                    {HEALTH_LABEL[data.status]}
                  </span>
                  <h2 className="mt-3 text-lg font-semibold leading-snug text-slate-900">
                    {headline(data.status, data.summary.critical_variances)}
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-500">
                    {formatPct(data.unit_accuracy_pct, 1)} of units match across{' '}
                    {data.summary.lines_tracked} stock lines.
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Last 14 days</span>
                  <Delta value={data.trend_delta} />
                </div>
                <TrendSparkline points={data.trend} stroke={HEALTH_TONE[data.status].stroke} />
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:gap-6 xl:col-span-3">
              <StatTile
                label="Open variances"
                value={data.summary.open_variances}
                hint={`${data.summary.investigated} being investigated`}
                icon={Layers}
                tone="info"
                to="/exceptions"
              />
              <StatTile
                label="Critical variances"
                value={data.summary.critical_variances}
                hint="Need action today"
                icon={AlertOctagon}
                tone="danger"
                to="/exceptions?severity=critical"
              />
              <StatTile
                label="New this week"
                value={data.summary.variances_this_week}
                hint="First seen in the last 7 days"
                icon={CalendarClock}
                tone="warn"
                to="/exceptions?since_days=7"
              />
              <StatTile
                label={STATIC_DEMO ? 'Data snapshot' : 'Last Odoo sync'}
                value={
                  STATIC_DEMO
                    ? formatShortDate(data.last_synced_at)
                    : timeAgo(data.last_synced_at, now).replace(' ago', '')
                }
                hint={`${data.summary.lines_tracked} stock lines ${STATIC_DEMO ? 'in the snapshot' : 'pulled'}`}
                icon={RefreshCcw}
                tone="neutral"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <TopMismatches
                items={data.top_mismatches}
                total={data.summary.open_variances}
              />
            </div>

            <Card className="pb-3">
              <CardHeader
                title="Accuracy by client"
                subtitle="Lowest first"
                action={
                  <Link
                    to="/accuracy"
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Details
                  </Link>
                }
              />
              <div className="mt-3 space-y-1 px-5">
                {clients.error && !clients.data ? (
                  <ErrorState compact message={clients.error} onRetry={clients.reload} />
                ) : !clients.data ? (
                  <div className="space-y-4 py-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-9" />
                    ))}
                  </div>
                ) : (
                  clients.data.rows.map((row) => (
                    <AccuracyRow
                      key={row.name}
                      row={row}
                      compact
                      to={`/exceptions?client=${encodeURIComponent(row.name)}`}
                    />
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

function headline(status: 'good' | 'attention' | 'critical', critical: number): string {
  if (status === 'good') return 'Stock records are in good shape.'
  if (critical > 0) {
    return `${critical} critical mismatch${critical === 1 ? '' : 'es'} could affect shipments.`
  }
  return 'A few mismatches need a second look.'
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return null
  const up = value >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}
    >
      <Icon size={14} />
      {up ? '+' : '−'}
      {Math.abs(value).toFixed(1)} pts
    </span>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading inventory health">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Skeleton className="h-[330px] xl:col-span-2" />
        <div className="grid grid-cols-2 gap-3 sm:gap-6 xl:col-span-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[150px]" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Skeleton className="h-[360px] xl:col-span-2" />
        <Skeleton className="h-[360px]" />
      </div>
    </div>
  )
}
