import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ALLOWED_TRANSITIONS,
  STATUS_LABELS,
  fetchOrder,
  updateOrderStatus,
  type OrderDetail,
} from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'
import { SlaBadge } from '../components/SlaBadge'
import { useRole } from '../auth/AuthContext'
import { formatAge, formatDateTime, formatMoney, formatOdooDate } from '../lib/format'

const CARRIERS = [
  'DHL Express',
  'GIG Logistics',
  'FedEx',
  'UPS',
  'Courier: store pickup',
]

function addressLines(shipping: OrderDetail['shipping']): string[] {
  if (!shipping) return []
  return [
    shipping.street,
    shipping.street2,
    [shipping.city, shipping.zip].filter(Boolean).join(' '),
    shipping.state,
    shipping.country,
  ].filter(Boolean) as string[]
}

export function OrderDetailPage() {
  const { id } = useParams()
  const { canAdvance, canCancel, actor, role } = useRole()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const [carrier, setCarrier] = useState(CARRIERS[0])
  const [tracking, setTracking] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const detail = await fetchOrder(Number(id))
      setOrder(detail)
      setCarrier(detail.carrier || CARRIERS[0])
      setTracking(detail.tracking_number || '')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function applyAction(action: string) {
    if (!order) return
    setWorking(true)
    setNotice(null)
    setError(null)
    try {
      const payload: { actor: string; carrier?: string; tracking_number?: string } = {
        actor,
      }
      if (action === 'dispatched') {
        payload.carrier = carrier
        payload.tracking_number = tracking
      }
      const result = await updateOrderStatus(order.id, action, payload)
      setNotice(`${order.name} → ${STATUS_LABELS[action]}`)
      if (result.odoo_writeback.attempted) {
        if (result.odoo_writeback.ok) {
          setNotice(
            `${order.name} → ${STATUS_LABELS[action]} · status written back to Odoo`
          )
        } else {
          setError(
            `Status saved, but the Odoo write-back failed: ${result.odoo_writeback.error}`
          )
        }
      }
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <div className="state-cell">Loading order…</div>
  if (error && !order) return <div className="alert alert-error">{error}</div>
  if (!order) return null

  const allowed = ALLOWED_TRANSITIONS[order.fulfillment_status] ?? []
  const forward = allowed.filter((action) => action !== 'cancelled')
  const canCancelThis = canCancel && allowed.includes('cancelled')
  const lines = order.lines ?? []
  const events = [...(order.events ?? [])].reverse()
  const addresses = addressLines(order.shipping)

  return (
    <div>
      <div className="no-print">
        <Link className="back-link" to="/orders">
          ← All orders
        </Link>

        <div className="page-header">
          <div>
            <div className="pretitle">
              {order.ref || 'No customer reference'} · {order.merchant}
            </div>
            <h2 className="page-title">{order.name}</h2>
          </div>
          <div className="page-header-actions">
            <span className="muted">Age {formatAge(order.age_hours)}</span>
            <SlaBadge ageHours={order.age_hours} status={order.fulfillment_status} />
            <button className="btn" type="button" onClick={() => window.print()}>
              Print packing slip
            </button>
          </div>
        </div>

        {notice && (
          <div className="alert alert-success" role="status">
            {notice}
          </div>
        )}
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {role === 'merchant' && (
          <div className="alert alert-info">
            Signed in as Merchant — read-only. Switch role in the header to move orders.
          </div>
        )}

        <div className="detail-grid">
          <section className="card card-pad">
            <div className="card-title-row">
              <h3 className="card-heading">Order status</h3>
              <StatusBadge status={order.fulfillment_status} />
            </div>

            <dl className="facts">
              <div>
                <dt>Customer</dt>
                <dd>{order.partner_name}</dd>
              </div>
              <div>
                <dt>Merchant</dt>
                <dd>{order.merchant}</dd>
              </div>
              <div>
                <dt>Order total</dt>
                <dd className="strong">{formatMoney(order.amount_total)}</dd>
              </div>
              <div>
                <dt>Odoo state</dt>
                <dd>{order.state}</dd>
              </div>
              <div>
                <dt>Placed</dt>
                <dd>{formatOdooDate(order.date_order)}</dd>
              </div>
              <div>
                <dt>Odoo order ID</dt>
                <dd>{order.id}</dd>
              </div>
            </dl>

            {forward.includes('dispatched') && (
              <div className="dispatch-box">
                <div className="dispatch-row">
                  <label className="field">
                    <span>Carrier</span>
                    <select
                      className="input"
                      value={carrier}
                      onChange={(event) => setCarrier(event.target.value)}
                    >
                      {CARRIERS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Tracking number</span>
                    <input
                      className="input"
                      value={tracking}
                      placeholder="e.g. JD0002334455"
                      onChange={(event) => setTracking(event.target.value)}
                    />
                  </label>
                </div>
                <div className="dispatch-row">
                  <span className="muted">
                    Captured now, then written back to the Odoo chatter when the order is
                    marked dispatched.
                  </span>
                </div>
              </div>
            )}

            <div className="action-buttons">
              {!canAdvance && forward.length > 0 && (
                <span className="muted">Read-only for your role.</span>
              )}

              {canAdvance &&
                forward.map((action) => (
                  <button
                    key={action}
                    className="btn btn-primary"
                    type="button"
                    disabled={working}
                    onClick={() => applyAction(action)}
                  >
                    {action === 'dispatched'
                      ? 'Mark dispatched'
                      : action === 'delivered'
                        ? 'Mark delivered'
                        : `Move to ${STATUS_LABELS[action]}`}
                  </button>
                ))}

              {forward.length === 0 && (
                <span className="muted">No further actions — order is {order.fulfillment_status}.</span>
              )}

              {canCancelThis && (
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={working}
                  onClick={() => applyAction('cancelled')}
                >
                  Cancel order
                </button>
              )}
            </div>
          </section>

          <section className="card card-pad">
            <h3 className="card-heading">Delivery</h3>
            <div className="delivery">
              <div>
                <strong>{order.shipping?.name || order.partner_name}</strong>
                {addresses.map((line) => (
                  <div key={line} className="sub">
                    {line}
                  </div>
                ))}
              </div>
              <div className="sub">
                {order.shipping?.phone && <div>Phone: {order.shipping.phone}</div>}
                {order.shipping?.email && <div>Email: {order.shipping.email}</div>}
              </div>
            </div>

            <dl className="facts">
              <div>
                <dt>Carrier</dt>
                <dd>{order.carrier || '—'}</dd>
              </div>
              <div>
                <dt>Tracking</dt>
                <dd>{order.tracking_number || '—'}</dd>
              </div>
              <div>
                <dt>Imported</dt>
                <dd>{formatDateTime(order.created_at)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-heading">Order lines</h3>
              <div className="muted">{lines.length} line(s)</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="state-cell">
                      No lines returned by Odoo.
                    </td>
                  </tr>
                )}
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <div className="strong">{line.product}</div>
                      <div className="sub">{line.name}</div>
                    </td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatMoney(line.unit_price)}</td>
                    <td className="num strong">{formatMoney(line.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="num muted">
                    Total
                  </td>
                  <td className="num strong">
                    {formatMoney(
                      lines.reduce((sum, line) => sum + (line.subtotal ?? 0), 0)
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="card card-pad">
          <div className="card-header">
            <div>
              <h3 className="card-heading">Timeline</h3>
              <div className="muted">Every status change, newest first</div>
            </div>
          </div>
          <ol className="timeline">
            {events.length === 0 && (
              <li className="timeline-empty">No status changes recorded yet.</li>
            )}
            {events.map((event) => (
              <li className="timeline-item" key={event.id}>
                <span className={`timeline-dot dot-${event.to_status}`} />
                <div className="timeline-body">
                  <div className="timeline-title">
                    {event.from_status ? `${STATUS_LABELS[event.from_status]} → ` : ''}
                    <strong>{STATUS_LABELS[event.to_status] ?? event.to_status}</strong>
                  </div>
                  <div className="timeline-meta">
                    {formatDateTime(event.created_at)} · by <strong>{event.actor}</strong>
                  </div>
                  {event.note && <div className="timeline-note">{event.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Packing slip: hidden on screen, the only thing printed. */}
      <section className="slip print-only">
        <header className="slip-header">
          <div>
            <strong>FULFILL 3PL</strong>
            <div className="sub">Packing slip</div>
          </div>
          <div className="slip-meta">
            <div>Order: {order.name}</div>
            <div>Ref: {order.ref || '—'}</div>
            <div>Placed: {formatOdooDate(order.date_order)}</div>
          </div>
        </header>

        <div className="slip-grid">
          <div>
            <div className="slip-label">Ship to</div>
            <div className="strong">{order.shipping?.name || order.partner_name}</div>
            {addresses.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          <div>
            <div className="slip-label">From</div>
            <div className="strong">{order.merchant}</div>
            <div>Fulfill 3PL Warehouse</div>
            <div>Lagos, Nigeria</div>
          </div>
          <div>
            <div className="slip-label">Shipping</div>
            <div>Carrier: {order.carrier || '—'}</div>
            <div>Tracking: {order.tracking_number || '—'}</div>
            <div>Status: {STATUS_LABELS[order.fulfillment_status]}</div>
          </div>
        </div>

        <table className="table slip-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Qty</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.name}</td>
                <td className="num">{line.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="slip-sign">
          <div className="slip-sign-line" />
          <div className="sub">Packed by (signature &amp; date)</div>
        </div>
      </section>
    </div>
  )
}
