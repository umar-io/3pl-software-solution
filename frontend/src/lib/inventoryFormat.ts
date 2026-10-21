import type { HealthStatus, ReviewStatus, Severity } from '../types/inventory'

const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export function formatQty(value: number | null | undefined): string {
  return value == null ? '—' : numberFmt.format(value)
}

export function formatSigned(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${numberFmt.format(Math.abs(value))}`
}

export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—'
  return `${value.toFixed(digits)}%`
}

export function formatDiffPct(value: number | null): string {
  if (value == null) return 'new stock'
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(0)}%`
}

export function formatAgeHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

/** "just now", "3 minutes ago", "2 hours ago" */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  moderate: 'Moderate',
  minor: 'Minor',
}

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  open: 'Open',
  investigated: 'Investigated',
  resolved: 'Resolved',
}

export const HEALTH_LABEL: Record<HealthStatus, string> = {
  good: 'Good',
  attention: 'Needs attention',
  critical: 'Critical',
}

/** Tailwind colour tokens per health band, kept in one place. */
export const HEALTH_TONE: Record<
  HealthStatus,
  { text: string; stroke: string; soft: string; ring: string; dot: string }
> = {
  good: {
    text: 'text-emerald-700',
    stroke: '#059669',
    soft: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    ring: 'ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  attention: {
    text: 'text-amber-700',
    stroke: '#d97706',
    soft: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    ring: 'ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  critical: {
    text: 'text-red-700',
    stroke: '#dc2626',
    soft: 'bg-red-50 text-red-700 ring-red-600/20',
    ring: 'ring-red-600/20',
    dot: 'bg-red-500',
  },
}

/** Accuracy percentage → health band (mirrors the backend thresholds). */
export function bandForAccuracy(pct: number): HealthStatus {
  if (pct >= 90) return 'good'
  if (pct >= 75) return 'attention'
  return 'critical'
}
