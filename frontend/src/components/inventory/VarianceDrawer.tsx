import { DatabaseZap, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../ui/Controls'
import { Difference, ReviewStatusPill, SeverityBadge } from './Badges'
import { formatAgeHours, formatDiffPct, formatQty } from '../../lib/inventoryFormat'
import type { ReviewStatus, Variance } from '../../types/inventory'

const STATUS_OPTIONS: { value: ReviewStatus; label: string; hint: string }[] = [
  { value: 'open', label: 'Open', hint: 'Not yet looked at' },
  { value: 'investigated', label: 'Investigated', hint: 'Someone is checking this' },
  { value: 'resolved', label: 'Resolved', hint: 'Explained or adjusted in Odoo' },
]

export function VarianceDrawer({
  variance,
  canEdit,
  canAdjust,
  saving,
  onClose,
  onSave,
  onAdjust,
}: {
  variance: Variance
  canEdit: boolean
  canAdjust: boolean
  saving: boolean
  onClose: () => void
  onSave: (status: ReviewStatus, note: string) => void
  onAdjust: (reason: string) => Promise<void>
}) {
  const [status, setStatus] = useState<ReviewStatus>(variance.status)
  const [note, setNote] = useState(variance.note ?? '')

  useEffect(() => {
    setStatus(variance.status)
    setNote(variance.note ?? '')
  }, [variance.id, variance.status, variance.note])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty = status !== variance.status || note.trim() !== (variance.note ?? '')

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/20" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={`Variance for ${variance.sku}`}
        className="relative flex h-[100dvh] w-full max-w-md animate-slide-in flex-col bg-white shadow-drawer"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Variance
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{variance.sku}</h2>
            <p className="text-sm text-slate-500">{variance.product}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center sm:gap-3 sm:p-4">
            <Stat label="Expected" value={formatQty(variance.expected)} />
            <Stat label="Counted" value={formatQty(variance.actual)} />
            <div>
              <div className="text-xs text-slate-500">Difference</div>
              <div className="mt-1 text-xl">
                <Difference value={variance.difference} />
              </div>
              <div className="text-xs text-slate-400">{formatDiffPct(variance.diff_pct)}</div>
            </div>
          </div>

          {variance.below_reserved && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              Counted quantity is below the {formatQty(variance.reserved)} units already reserved
              for orders — shipments may be short.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Field label="Client">{variance.client}</Field>
            <Field label="Location">{variance.location}</Field>
            <Field label="Severity">
              <SeverityBadge severity={variance.severity} />
            </Field>
            <Field label="Age">{formatAgeHours(variance.age_hours)} since first seen</Field>
          </dl>

          <fieldset disabled={!canEdit || saving}>
            <legend className="text-sm font-medium text-slate-900">Status</legend>
            <div className="mt-2 space-y-2">
              {STATUS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
                    status === option.value
                      ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="review-status"
                    className="accent-brand-600"
                    checked={status === option.value}
                    onChange={() => setStatus(option.value)}
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-slate-900">
                      {option.label}
                    </span>
                    <span className="block text-xs text-slate-500">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-900" htmlFor="review-note">
              Note
            </label>
            <textarea
              id="review-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Re-count scheduled for Aisle 4"
              className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
            />
          </fieldset>

          {canAdjust && variance.status !== 'resolved' && (
            <AdjustPanel variance={variance} onAdjust={onAdjust} disabled={saving} />
          )}

          {variance.actor && (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              Last updated by {variance.actor} · currently <ReviewStatusPill status={variance.status} />
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          {!canEdit ? (
            <span className="text-xs text-slate-500">Read-only for your role.</span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!canEdit || !dirty || saving}
              onClick={() => onSave(status, note)}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-900">{children}</dd>
    </div>
  )
}

/** Two-step, admin-only action that changes real stock in Odoo. */
function AdjustPanel({
  variance,
  onAdjust,
  disabled,
}: {
  variance: Variance
  onAdjust: (reason: string) => Promise<void>
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [verified, setVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOpen(false)
    setReason('')
    setVerified(false)
    setError(null)
  }, [variance.id])

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onAdjust(reason.trim())
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-start gap-3">
          <DatabaseZap size={18} className="mt-0.5 shrink-0 text-slate-400" />
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-900">Fix it in Odoo</div>
            <p className="mt-0.5 text-sm text-slate-500">
              Set on-hand to the counted quantity so Odoo matches the shelf.
            </p>
            <Button className="mt-3" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
              Apply adjustment…
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
      <div className="text-sm font-semibold text-slate-900">Confirm Odoo adjustment</div>
      <p className="mt-1.5 text-sm text-slate-700">
        This will change on-hand for <b>{variance.sku}</b> at <b>{variance.location}</b> from{' '}
        <b>{formatQty(variance.expected)}</b> to <b>{formatQty(variance.actual)}</b> (
        <Difference value={variance.difference} />) and record a stock move in Odoo. It can’t be
        undone from here.
      </p>
      {variance.below_reserved && (
        <p className="mt-2 text-sm text-red-700">
          {formatQty(variance.reserved)} units are reserved for orders; those orders may become
          unfulfillable.
        </p>
      )}

      <label htmlFor="adjust-reason" className="mt-4 block text-sm font-medium text-slate-900">
        Reason <span className="font-normal text-slate-500">(saved to the audit log and Odoo)</span>
      </label>
      <textarea
        id="adjust-reason"
        rows={2}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="e.g. Recount confirmed by two staff; carrier acknowledged shortage"
        className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />

      <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 accent-brand-600"
          checked={verified}
          onChange={(event) => setVerified(event.target.checked)}
        />
        I’ve verified the counted quantity is correct.
      </label>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" disabled={busy} onClick={() => setOpen(false)}>
          Back
        </Button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy || !verified || reason.trim().length < 3}
          className="inline-flex h-8 items-center rounded-lg bg-red-600 px-3 text-[13px] font-medium text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-600/40"
        >
          {busy ? 'Applying…' : 'Apply to Odoo'}
        </button>
      </div>
    </div>
  )
}
