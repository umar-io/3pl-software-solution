import { STATUS_LABELS, type FulfillmentStatus } from '../lib/api'

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: string
  size?: 'sm' | 'md'
}) {
  const label = STATUS_LABELS[status] ?? status
  return (
    <span className={`badge badge-${status} ${size === 'sm' ? 'badge-sm' : ''}`}>
      {label}
    </span>
  )
}
