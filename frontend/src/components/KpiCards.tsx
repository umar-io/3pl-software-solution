import { STATUS_LABELS, STATUS_ORDER } from '../lib/api'

export function KpiCards({
  counts,
  active,
  onSelect,
}: {
  counts: Record<string, number>
  active: string | null
  onSelect: (status: string | null) => void
}) {
  const total = STATUS_ORDER.reduce(
    (sum, status) => sum + (counts[status] ?? 0),
    0
  )

  return (
    <div className="kpi-grid">
      <button
        type="button"
        className={`kpi ${active === null ? 'kpi-active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="kpi-label">All orders</span>
        <span className="kpi-value">{total}</span>
      </button>

      {STATUS_ORDER.map((status) => (
        <button
          key={status}
          type="button"
          className={`kpi kpi-${status} ${
            active === status ? 'kpi-active' : ''
          }`}
          onClick={() => onSelect(active === status ? null : status)}
        >
          <span className="kpi-label">{STATUS_LABELS[status]}</span>
          <span className="kpi-value">{counts[status] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}
