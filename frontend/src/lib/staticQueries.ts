/**
 * Pure re-implementations of the backend's list/filter rules, used by the static
 * demo. Keep in step with app/services/inventory_service.list_variances and
 * order_service.orders_list.
 */
import type {
  ReviewStatus,
  Severity,
  Variance,
  VarianceListResponse,
  VarianceQuery,
} from '../types/inventory'
import type { OrderListResponse, OrderQuery, OrderSummary } from './api'

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, moderate: 1, minor: 2 }
const REVIEW: ReviewStatus[] = ['open', 'investigated', 'resolved']
const DAY_MS = 86_400_000

const active = (v: Variance) => v.status !== 'resolved'

export function queryVariances(
  all: Variance[],
  params: VarianceQuery,
  asOf: string,
  lastSyncedAt: string
): VarianceListResponse {
  const { client, location, severity, since_days, sort = 'severity' } = params
  const status = params.status ?? 'active'
  const limit = params.limit ?? 50
  const offset = params.offset ?? 0
  const cutoff = since_days ? new Date(asOf).getTime() - since_days * DAY_MS : null
  const needle = params.q?.trim().toLowerCase()

  const matches = (v: Variance, skip?: 'client' | 'location' | 'severity' | 'status') => {
    if (skip !== 'client' && client && v.client !== client) return false
    if (skip !== 'location' && location && v.location !== location) return false
    if (skip !== 'severity' && severity && v.severity !== severity) return false
    if (skip !== 'status') {
      if (status === 'active' && !active(v)) return false
      if ((REVIEW as string[]).includes(status) && v.status !== status) return false
    }
    if (cutoff !== null && new Date(v.first_seen_at).getTime() < cutoff) return false
    if (needle && !`${v.sku} ${v.product}`.toLowerCase().includes(needle)) return false
    return true
  }

  const abs = (v: Variance) => Math.abs(v.difference)
  const sorters: Record<string, (a: Variance, b: Variance) => number> = {
    severity: (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || abs(b) - abs(a),
    difference: (a, b) => abs(b) - abs(a),
    age: (a, b) => b.age_hours - a.age_hours,
    sku: (a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0),
  }

  const rows = all.filter((v) => matches(v)).sort(sorters[sort] ?? sorters.severity)
  const sevScope = all.filter((v) => matches(v, 'severity'))
  const statusScope = all.filter((v) => matches(v, 'status'))
  const uniq = (xs: string[]) => [...new Set(xs)].sort()

  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    severity_counts: {
      critical: sevScope.filter((v) => v.severity === 'critical').length,
      moderate: sevScope.filter((v) => v.severity === 'moderate').length,
      minor: sevScope.filter((v) => v.severity === 'minor').length,
    },
    status_counts: {
      active: statusScope.filter(active).length,
      open: statusScope.filter((v) => v.status === 'open').length,
      investigated: statusScope.filter((v) => v.status === 'investigated').length,
      resolved: statusScope.filter((v) => v.status === 'resolved').length,
      all: statusScope.length,
    },
    clients: uniq(all.map((v) => v.client)),
    locations: uniq(all.map((v) => v.location)),
    last_synced_at: lastSyncedAt,
  }
}

export function queryOrders(all: OrderListResponse, params: OrderQuery): OrderListResponse {
  const items: OrderSummary[] = all.items
  let filtered = items
  if (params.status) filtered = filtered.filter((i) => i.fulfillment_status === params.status)
  if (params.merchant) filtered = filtered.filter((i) => i.merchant === params.merchant)
  if (params.q) {
    const needle = params.q.trim().toLowerCase()
    filtered = filtered.filter(
      (i) =>
        (i.name || '').toLowerCase().includes(needle) ||
        (i.partner_name || '').toLowerCase().includes(needle) ||
        (i.ref || '').toLowerCase().includes(needle)
    )
  }
  const offset = Math.max(params.offset ?? 0, 0)
  const limit = Math.max(params.limit ?? 50, 0)
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    counts: all.counts,
    merchants: all.merchants,
    last_synced_at: all.last_synced_at,
  }
}
