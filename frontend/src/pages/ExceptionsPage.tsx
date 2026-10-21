import { ArrowDown, CircleCheck, FilterX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useRole } from '../auth/AuthContext'
import { Difference, ReviewStatusPill, SeverityBadge } from '../components/inventory/Badges'
import { SyncIndicator } from '../components/inventory/SyncIndicator'
import { VarianceCard } from '../components/inventory/VarianceCard'
import { VarianceDrawer } from '../components/inventory/VarianceDrawer'
import { Card, PageHeader } from '../components/ui/Card'
import { Button, FilterSelect, SearchInput, Segmented } from '../components/ui/Controls'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { Pager } from '../components/ui/Pager'
import { useToast } from '../components/ui/Toast'
import { useAsync } from '../hooks/useAsync'
import { useSyncAction } from '../hooks/useSyncAction'
import { inventoryApi } from '../lib/inventoryApi'
import { REVIEW_LABEL, formatAgeHours, formatDiffPct, formatQty } from '../lib/inventoryFormat'
import type {
  ReviewStatus,
  Severity,
  StatusFilter,
  Variance,
  VarianceQuery,
} from '../types/inventory'

const PAGE_SIZE = 25
type SortKey = NonNullable<VarianceQuery['sort']>

const DATE_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]

const NEXT_ACTION: Record<ReviewStatus, { to: ReviewStatus; label: string }> = {
  open: { to: 'investigated', label: 'Mark investigated' },
  investigated: { to: 'resolved', label: 'Resolve' },
  resolved: { to: 'open', label: 'Reopen' },
}

export function ExceptionsPage() {
  const [params, setParams] = useSearchParams()
  const { canReview, can } = useRole()
  const toast = useToast()

  const filters: VarianceQuery = useMemo(
    () => ({
      client: params.get('client') || undefined,
      location: params.get('location') || undefined,
      severity: (params.get('severity') as Severity) || undefined,
      status: (params.get('status') as StatusFilter) || 'active',
      since_days: params.get('since_days') ? Number(params.get('since_days')) : undefined,
      q: params.get('q') || undefined,
      sort: (params.get('sort') as SortKey) || 'severity',
      offset: Number(params.get('offset') || 0),
    }),
    [params]
  )

  const setParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(updates)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          // Any filter change returns to the first page.
          if (!('offset' in updates)) next.delete('offset')
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )

  // Search box edits locally and syncs to the URL after a short pause.
  const [search, setSearch] = useState(filters.q ?? '')
  useEffect(() => setSearch(filters.q ?? ''), [filters.q])
  useEffect(() => {
    if (search === (filters.q ?? '')) return
    const id = window.setTimeout(() => setParam({ q: search.trim() || undefined }), 250)
    return () => window.clearTimeout(id)
  }, [search, filters.q, setParam])

  const list = useAsync(
    (signal) => inventoryApi.variances({ ...filters, limit: PAGE_SIZE }, signal),
    [params.toString()],
    60_000
  )
  const { sync, syncing } = useSyncAction(list.reload)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const selected = list.data?.items.find((v) => v.id === selectedId) ?? null

  const review = async (variance: Variance, status: ReviewStatus, note?: string) => {
    setSaving(true)
    try {
      await inventoryApi.review(variance.id, { status, note })
      toast.success(`${variance.sku} marked ${REVIEW_LABEL[status].toLowerCase()}`)
      setSelectedId(null)
      list.reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const adjust = async (variance: Variance, reason: string) => {
    // Throws on failure so the drawer can show Odoo's message inline.
    const result = await inventoryApi.adjust(variance.id, {
      expected: variance.expected,
      counted: variance.actual,
      reason,
    })
    toast.success(
      `${variance.sku} set to ${result.quantity_after} in Odoo` +
        (result.chatter_posted ? '' : ' (note not posted)')
    )
    setSelectedId(null)
    list.reload()
  }

  const data = list.data
  const hasFilters = Boolean(
    filters.client || filters.location || filters.severity || filters.since_days || filters.q
  ) || filters.status !== 'active'

  const clearFilters = () => {
    setSearch('')
    setParams({}, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Exception queue"
        subtitle="Counted quantities that don’t match Odoo. Work the critical ones first."
        actions={
          <SyncIndicator
            syncedAt={data?.last_synced_at}
            refreshing={syncing || list.refreshing}
            onRefresh={sync}
          />
        }
      />

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<StatusFilter>
              label="Status"
              value={filters.status ?? 'active'}
              onChange={(value) => setParam({ status: value === 'active' ? undefined : value })}
              options={[
                { value: 'active', label: 'Active', count: data?.status_counts.active },
                { value: 'open', label: 'Open', count: data?.status_counts.open },
                { value: 'investigated', label: 'Investigated', count: data?.status_counts.investigated },
                { value: 'resolved', label: 'Resolved', count: data?.status_counts.resolved },
              ]}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Search SKU or product" />
          </div>

          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
            <FilterSelect
              label="Client"
              allLabel="All clients"
              value={filters.client ?? ''}
              onChange={(value) => setParam({ client: value || undefined })}
              options={(data?.clients ?? (filters.client ? [filters.client] : [])).map((c) => ({ value: c, label: c }))}
            />
            <FilterSelect
              label="Location"
              allLabel="All locations"
              value={filters.location ?? ''}
              onChange={(value) => setParam({ location: value || undefined })}
              options={(data?.locations ?? (filters.location ? [filters.location] : [])).map((l) => ({ value: l, label: l }))}
            />
            <FilterSelect
              label="First seen"
              allLabel="Any date"
              value={filters.since_days ? String(filters.since_days) : ''}
              onChange={(value) => setParam({ since_days: value || undefined })}
              options={DATE_OPTIONS}
            />
            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
            <div className="col-span-2 min-w-0 sm:col-auto">
            <Segmented<Severity | 'all'>
              label="Severity"
              value={filters.severity ?? 'all'}
              onChange={(value) => setParam({ severity: value === 'all' ? undefined : value })}
              options={[
                { value: 'all', label: 'All severities' },
                { value: 'critical', label: 'Critical', count: data?.severity_counts.critical },
                { value: 'moderate', label: 'Moderate', count: data?.severity_counts.moderate },
                { value: 'minor', label: 'Minor', count: data?.severity_counts.minor },
              ]}
            />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" icon={<FilterX size={14} />} onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {list.error && !data ? (
          <ErrorState compact message={list.error} onRetry={list.reload} />
        ) : !data ? (
          <TableSkeleton />
        ) : data.total === 0 ? (
          hasFilters ? (
            <EmptyState
              title="No variances match these filters"
              body="Try widening the date range or clearing a filter."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              icon={<CircleCheck size={20} className="text-emerald-600" />}
              title="All clear"
              body="No counted line differs from Odoo right now."
            />
          )
        ) : (
          <>
            <ul className={`divide-y divide-slate-100 transition-opacity lg:hidden ${list.refreshing ? 'opacity-70' : ''}`}>
              {data.items.map((v) => {
                const next = NEXT_ACTION[v.status]
                return (
                  <li key={v.id}>
                    <VarianceCard
                      variance={v}
                      showStatus
                      onClick={() => setSelectedId(v.id)}
                      action={
                        canReview && (
                          <Button
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              review(v, next.to)
                            }}
                          >
                            {next.label}
                          </Button>
                        )
                      }
                    />
                  </li>
                )
              })}
            </ul>
            <div className={`hidden overflow-x-auto transition-opacity lg:block ${list.refreshing ? 'opacity-70' : ''}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                    <Th sort="sku" current={filters.sort} onSort={(s) => setParam({ sort: s })}>SKU</Th>
                    <Th>Client</Th>
                    <Th>Location</Th>
                    <Th align="right">Expected</Th>
                    <Th align="right">Actual</Th>
                    <Th sort="difference" align="right" current={filters.sort} onSort={(s) => setParam({ sort: s })}>Difference</Th>
                    <Th sort="age" current={filters.sort} onSort={(s) => setParam({ sort: s })}>Age</Th>
                    <Th sort="severity" current={filters.sort} onSort={(s) => setParam({ sort: s })}>Severity</Th>
                    <Th>Status</Th>
                    <Th>{''}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((v) => {
                    const next = NEXT_ACTION[v.status]
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={`cursor-pointer transition hover:bg-slate-50 ${v.status === 'resolved' ? 'opacity-60' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{v.sku}</div>
                          <div className="max-w-[200px] truncate text-xs text-slate-500">{v.product}</div>
                          {v.note && (
                            <div className="mt-0.5 max-w-[200px] truncate text-xs italic text-slate-400" title={v.note}>
                              “{v.note}”
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{v.client}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{v.location}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatQty(v.expected)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatQty(v.actual)}</td>
                        <td className="px-4 py-3 text-right">
                          <Difference value={v.difference} />
                          <div className="text-xs text-slate-400">{formatDiffPct(v.diff_pct)}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600 tabular-nums">
                          {formatAgeHours(v.age_hours)}
                        </td>
                        <td className="px-4 py-3"><SeverityBadge severity={v.severity} /></td>
                        <td className="px-4 py-3"><ReviewStatusPill status={v.status} /></td>
                        <td className="px-4 py-3 text-right">
                          {canReview && (
                            <Button
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation()
                                review(v, next.to)
                              }}
                            >
                              {next.label}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pager
              total={data.total}
              limit={PAGE_SIZE}
              offset={filters.offset ?? 0}
              noun="variances"
              onChange={(offset) => setParam({ offset: offset ? String(offset) : undefined })}
            />
          </>
        )}
      </Card>

      {selected && (
        <VarianceDrawer
          variance={selected}
          canEdit={canReview}
          canAdjust={can('variance:adjust')}
          onAdjust={(reason) => adjust(selected, reason)}
          saving={saving}
          onClose={() => setSelectedId(null)}
          onSave={(status, note) => review(selected, status, note)}
        />
      )}
    </>
  )
}

function Th({
  children,
  sort,
  current,
  onSort,
  align = 'left',
}: {
  children: React.ReactNode
  sort?: SortKey
  current?: SortKey
  onSort?: (sort: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort && current === sort
  return (
    <th className={`px-4 py-2.5 font-medium ${align === 'right' ? 'text-right' : ''}`}>
      {sort && onSort ? (
        <button
          type="button"
          onClick={() => onSort(sort)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-slate-900 ${active ? 'text-slate-900' : ''}`}
        >
          {children}
          {active && <ArrowDown size={12} />}
        </button>
      ) : (
        children
      )}
    </th>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading variances">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  )
}
