export type Severity = 'critical' | 'moderate' | 'minor'
export type ReviewStatus = 'open' | 'investigated' | 'resolved'
export type HealthStatus = 'good' | 'attention' | 'critical'
export type StatusFilter = 'active' | ReviewStatus | 'all'

export interface Variance {
  id: number
  sku: string
  product: string
  client: string
  location: string
  expected: number
  actual: number
  difference: number
  diff_pct: number | null
  reserved: number
  below_reserved: boolean
  severity: Severity
  status: ReviewStatus
  note: string | null
  actor: string | null
  first_seen_at: string
  age_hours: number
  updated_at: string | null
}

export interface TrendPoint {
  date: string
  score: number
  open_variances: number
}

export interface HealthResponse {
  score: number
  status: HealthStatus
  accuracy_pct: number
  unit_accuracy_pct: number
  trend_delta: number | null
  summary: {
    open_variances: number
    critical_variances: number
    variances_this_week: number
    lines_tracked: number
    investigated: number
  }
  trend: TrendPoint[]
  top_mismatches: Variance[]
  last_synced_at: string
}

export interface VarianceQuery {
  client?: string
  location?: string
  severity?: Severity
  status?: StatusFilter
  since_days?: number
  q?: string
  sort?: 'severity' | 'difference' | 'age' | 'sku'
  limit?: number
  offset?: number
}

export interface VarianceListResponse {
  items: Variance[]
  total: number
  severity_counts: Record<Severity, number>
  status_counts: Record<StatusFilter, number>
  clients: string[]
  locations: string[]
  last_synced_at: string
}

export interface BreakdownRow {
  name: string
  accuracy_pct: number
  unit_accuracy_pct: number
  lines: number
  variances: number
  critical: number
  abs_diff_units: number
}

export interface BreakdownResponse {
  group_by: 'client' | 'location'
  rows: BreakdownRow[]
  overall_accuracy_pct: number
  last_synced_at: string
}

export interface Receipt {
  id: number
  name: string
  state: string
  partner: string | null
  origin: string | null
  scheduled_date: string | null
  date_done: string | null
  ordered_qty: number
  received_qty: number | null
  confirmed: boolean
  blind: boolean
  mismatch: boolean
}

export interface HighVelocitySku {
  sku: string
  product: string
  client: string
  units_30d: number
  counted: boolean
  last_counted_at: string | null
}

export interface ReceivingResponse {
  window_days: number
  receiving: {
    total: number
    completed: number
    confirmed: number
    confirmed_pct: number | null
    pending: number
    mismatches: number
    blind_receipts: number
    recent: Receipt[]
  }
  cycle_count: {
    high_velocity_total: number
    high_velocity_counted: number
    high_velocity_pct: number | null
    high_velocity: HighVelocitySku[]
    skus_tracked: number
    skus_counted: number
    coverage_pct: number | null
  }
  last_synced_at: string
}
