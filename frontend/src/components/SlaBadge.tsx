import { formatAge, slaLabel, slaLevel, type SlaLevel } from '../lib/format'
import type { FulfillmentStatus } from '../lib/api'

export function SlaBadge({
  ageHours,
  status,
}: {
  ageHours: number | null
  status: FulfillmentStatus | string
}) {
  const level: SlaLevel = slaLevel(ageHours, status)
  if (level === 'none') {
    return <span className="sla sla-none">Closed</span>
  }
  return (
    <span className={`sla sla-${level}`} title={slaLabel(level)}>
      {formatAge(ageHours)} · {slaLabel(level)}
    </span>
  )
}
