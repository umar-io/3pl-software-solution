export function Pagination({
  total,
  limit,
  offset,
  onChange,
  label = 'orders',
}: {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
  label?: string
}) {
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + limit, total)

  return (
    <div className="pagination">
      <span className="muted">
        {total === 0
          ? `No ${label}`
          : `${from}–${to} of ${total} ${label} · page ${page}/${pages}`}
      </span>
      <div className="pagination-buttons">
        <button
          className="btn"
          type="button"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <button
          className="btn"
          type="button"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  )
}
