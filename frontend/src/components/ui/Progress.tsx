import { HEALTH_TONE, bandForAccuracy } from '../../lib/inventoryFormat'

/** Horizontal progress bar coloured by the shared accuracy bands. */
export function ProgressBar({
  value,
  height = 'h-2',
  showMarkers = false,
  label,
}: {
  value: number | null
  height?: string
  showMarkers?: boolean
  label: string
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  const tone = HEALTH_TONE[bandForAccuracy(pct)]
  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-slate-100 ${height}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone.dot}`}
        style={{ width: `${pct}%` }}
      />
      {showMarkers &&
        [75, 90].map((mark) => (
          <span
            key={mark}
            className="absolute inset-y-0 w-px bg-white/80"
            style={{ left: `${mark}%` }}
          />
        ))}
    </div>
  )
}
