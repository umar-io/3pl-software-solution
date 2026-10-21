import { TERMINAL_STATUSES, type FulfillmentStatus } from './api'

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount ?? 0)
}

/** Odoo/servers send either naive UTC or timezone-tagged ISO strings. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const isTagged = /Z$/i.test(value) || /[+-]\d{2}:\d{2}$/.test(value)
  const date = new Date(isTagged ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = toDate(value)
  if (!date) return value
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = toDate(value)
  if (!date) return value
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Odoo sends naive UTC timestamps like "2026-10-07 14:39:43". */
export function formatOdooDate(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

export function formatAge(hours: number | null | undefined): string {
  if (hours == null) return '—'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

export type SlaLevel = 'ok' | 'warn' | 'overdue' | 'none'

const WARN_HOURS = 24
const OVERDUE_HOURS = 48

export function slaLevel(
  ageHours: number | null | undefined,
  status: FulfillmentStatus | string
): SlaLevel {
  if (TERMINAL_STATUSES.includes(status as FulfillmentStatus)) return 'none'
  if (ageHours == null) return 'none'
  if (ageHours >= OVERDUE_HOURS) return 'overdue'
  if (ageHours >= WARN_HOURS) return 'warn'
  return 'ok'
}

export function slaLabel(level: SlaLevel): string {
  if (level === 'overdue') return `Overdue > ${OVERDUE_HOURS}h`
  if (level === 'warn') return `Aging > ${WARN_HOURS}h`
  return 'Within SLA'
}
