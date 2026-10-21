import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ALLOWED_TRANSITIONS,
  STATUS_LABELS,
  bulkAdvance,
  fetchOrders,
  syncOrders,
  updateOrderStatus,
  type OrderListResponse,
  type OrderSummary,
} from '../lib/api'
import { KpiCards } from '../components/KpiCards'
import { Pagination } from '../components/Pagination'
import { SlaBadge } from '../components/SlaBadge'
import { formatDateTime, formatMoney, slaLevel } from '../lib/format'
import { StatusBadge } from '../components/StatusBadge'
import { useRole } from '../auth/AuthContext'
import { STATIC_DEMO } from '../lib/demo'

const PAGE_SIZE = 10
const DEFAULT_MERCHANT = 'Glow Cosmetics'

function nextAction(order: OrderSummary): string | null {
  const allowed = ALLOWED_TRANSITIONS[order.fulfillment_status] ?? []
  return allowed.find((action) => action !== 'cancelled') ?? null
}

export function OrdersPage() {
  const navigate = useNavigate()
  const { canAdvance, canCancel, actor, role } = useRole()

  const [data, setData] = useState<OrderListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [merchant, setMerchant] = useState('')
  const [offset, setOffset] = useState(0)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [working, setWorking] = useState(false)
  const autoSynced = useRef(false)

  useEffect(() => {
    if (role === 'merchant' && !merchant) {
      setMerchant(DEFAULT_MERCHANT)
      setOffset(0)
    }
  }, [role, merchant])

  const load = useCallback(
    async (options: { status?: string | null; offset?: number } = {}) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchOrders({
          q: q || undefined,
          status: options.status === undefined ? (status ?? undefined) : options.status ?? undefined,
          merchant: merchant || undefined,
          limit: PAGE_SIZE,
          offset: options.offset === undefined ? offset : options.offset,
        })
        setData(res)

        // First run on an empty database: pull orders in from Odoo for the demo.
        if (res.total === 0 && !autoSynced.current) {
          autoSynced.current = true
          const synced = await syncOrders()
          if (synced.created > 0) {
            setNotice(`Imported ${synced.created} order(s) from Odoo`)
            const refreshed = await fetchOrders({
              limit: PAGE_SIZE,
              offset: 0,
            })
            setData(refreshed)
          }
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [q, status, merchant, offset]
  )

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, merchant, offset])

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(searchInput.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  function selectStatus(next: string | null) {
    setStatus(next)
    setOffset(0)
    setSelected(new Set())
  }

  function selectMerchant(next: string) {
    setMerchant(next)
    setOffset(0)
    setSelected(new Set())
  }

  function toggleSelected(id: number, advanceable: boolean) {
    if (!advanceable) return
    setSelected((prev) => {
      const copy = new Set(prev)
      if (copy.has(id)) copy.delete(id)
      else copy.add(id)
      return copy
    })
  }

  function toggleAll(items: OrderSummary[]) {
    setSelected((prev) => {
      const selectable = items.filter((item) => nextAction(item))
      const allSelected = selectable.length > 0 && selectable.every((i) => prev.has(i.id))
      if (allSelected) return new Set()
      return new Set(selectable.map((item) => item.id))
    })
  }

  async function handleSync() {
    setWorking(true)
    setNotice(null)
    setError(null)
    try {
      const result = await syncOrders()
      setNotice(
        `Synced ${result.scanned} Odoo orders · ${result.created} new · ${result.updated} updated`
      )
      setOffset(0)
      await load({ offset: 0 })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function handleBulkAdvance() {
    if (selected.size === 0) return
    setWorking(true)
    setNotice(null)
    setError(null)
    try {
      const result = await bulkAdvance([...selected], actor)
      const skipped = result.results.filter((r) => !r.ok)
      setNotice(
        `Advanced ${result.advanced} order(s)` +
          (skipped.length ? ` · ${skipped.length} skipped (already terminal)` : '')
      )
      setSelected(new Set())
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function handleQuickAdvance(order: OrderSummary, action: string) {
    setNotice(null)
    setError(null)
    try {
      const result = await updateOrderStatus(order.id, action, { actor })
      setNotice(`${order.name} → ${STATUS_LABELS[action]}`)
      if (result.odoo_writeback.attempted && !result.odoo_writeback.ok) {
        setError(`Status saved, but the Odoo write-back failed: ${result.odoo_writeback.error}`)
      }
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function exportCsv() {
    try {
      const res = await fetchOrders({
        q: q || undefined,
        status: status ?? undefined,
        merchant: merchant || undefined,
        limit: 200,
        offset: 0,
      })
      const header = [
        'order',
        'reference',
        'customer',
        'merchant',
        'amount_total',
        'odoo_state',
        'fulfillment_status',
        'carrier',
        'tracking_number',
        'ordered_at',
        'age_hours',
      ]
      const rows = res.items.map((o) =>
        [
          o.name,
          o.ref,
          o.partner_name,
          o.merchant,
          o.amount_total,
          o.state,
          o.fulfillment_status,
          o.carrier ?? '',
          o.tracking_number ?? '',
          o.date_order ?? '',
          o.age_hours ?? '',
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      )
      const csv = [header.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'fulfillment-orders.csv'
      link.click()
      URL.revokeObjectURL(url)
      setNotice(`Exported ${res.items.length} order(s) to CSV`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const items = data?.items ?? []
  const selectableIds = items.filter((item) => nextAction(item)).map((i) => i.id)
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const lastSynced = data?.last_synced_at ? formatDateTime(data.last_synced_at) : null

  return (
    <div className="no-print">
      <div className="page-header">
        <div>
          <div className="pretitle">Warehouse</div>
          <h2 className="page-title">Order fulfillment</h2>
        </div>
        <div className="page-header-actions">
          <button className="btn" type="button" onClick={exportCsv} disabled={loading}>
            Export CSV
          </button>
          {!STATIC_DEMO && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleSync}
            disabled={working}
            title="Pull every Odoo sale order into the local fulfillment table"
          >
            {working ? 'Working…' : 'Sync from Odoo'}
          </button>
          )}
        </div>
      </div>

      <div className="sync-strip">
        <span className="dot dot-ok" aria-hidden="true" />
        {lastSynced ? (
          <span>
            Last sync {lastSynced} · {data?.total ?? 0} order(s) in view
          </span>
        ) : (
          <span>Not synced yet — press “Sync from Odoo” to import orders.</span>
        )}
      </div>

      {role === 'merchant' && (
        <div className="alert alert-info" role="status">
          Merchant view — showing orders for <strong>{merchant || DEFAULT_MERCHANT}</strong> only.
          Switch the role in the header to see the full desk.
        </div>
      )}
      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button type="button" className="alert-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <KpiCards counts={data?.counts ?? {}} active={status} onSelect={selectStatus} />

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-filters">
            <input
              className="input search-input"
              type="search"
              placeholder="Search order, customer or reference…"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value)
                setOffset(0)
              }}
            />
            <select
              className="input"
              value={merchant}
              onChange={(event) => selectMerchant(event.target.value)}
            >
              <option value="">All merchants</option>
              {(data?.merchants ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-actions">
            {canAdvance && (
              <>
                <span className="muted">{selected.size} selected</span>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={selected.size === 0 || working}
                  onClick={handleBulkAdvance}
                >
                  Advance selected
                </button>
                {selected.size > 0 && (
                  <button className="btn" type="button" onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                {canAdvance && (
                  <th className="col-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleAll(items)}
                      aria-label="Select all"
                      disabled={selectableIds.length === 0}
                    />
                  </th>
                )}
                <th>Order</th>
                <th>Customer</th>
                <th>Merchant</th>
                <th className="num">Total</th>
                <th>Odoo state</th>
                <th>Fulfillment</th>
                <th>Age</th>
                <th className="actions-col">Next step</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="state-cell">
                    Loading orders…
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="state-cell">
                    {error
                      ? 'Could not reach the API.'
                      : status || merchant || q
                        ? 'No orders match these filters.'
                        : 'No orders yet. Press “Sync from Odoo” to import.'}
                  </td>
                </tr>
              )}

              {!loading &&
                items.map((order) => {
                  const next = nextAction(order)
                  const advanceable = canAdvance && next !== null
                  const nextNeedsDetail = next === 'dispatched' || next === 'delivered'
                  const level = slaLevel(order.age_hours, order.fulfillment_status)
                  const rowClass = [
                    selected.has(order.id) ? 'row-selected' : '',
                    level === 'overdue' ? 'row-overdue' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <tr key={order.id} className={rowClass}>
                      {canAdvance && (
                        <td className="col-check">
                          <input
                            type="checkbox"
                            checked={selected.has(order.id)}
                            onChange={() => toggleSelected(order.id, next !== null)}
                            aria-label={`Select ${order.name}`}
                            disabled={next === null}
                          />
                        </td>
                      )}
                      <td className="order-cell">
                        <Link className="order-link" to={`/orders/${order.id}`}>
                          {order.name}
                        </Link>
                        {order.ref && <div className="sub">{order.ref}</div>}
                      </td>
                      <td data-label="Customer">{order.partner_name}</td>
                      <td data-label="Merchant">{order.merchant}</td>
                      <td className="num strong" data-label="Total">{formatMoney(order.amount_total)}</td>
                      <td data-label="Odoo state">
                        <span className="odoo-state">{order.state}</span>
                      </td>
                      <td data-label="Fulfillment">
                        <StatusBadge status={order.fulfillment_status} />
                      </td>
                      <td data-label="Age">
                        <SlaBadge
                          ageHours={order.age_hours}
                          status={order.fulfillment_status}
                        />
                      </td>
                      <td className="actions-col">
                        {!advanceable ? (
                          <span className="muted">
                            {order.fulfillment_status === 'delivered' ? 'Done' : 'View only'}
                          </span>
                        ) : nextNeedsDetail ? (
                          <Link
                            className="btn btn-primary btn-sm"
                            to={`/orders/${order.id}`}
                          >
                            {next === 'delivered' ? 'Mark delivered' : 'Add tracking'}
                          </Link>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            onClick={() => handleQuickAdvance(order, next!)}
                          >
                            {STATUS_LABELS[next]}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <div className="card-footer">
          <Pagination
            total={data?.total ?? 0}
            limit={PAGE_SIZE}
            offset={offset}
            onChange={(next) => {
              setOffset(next)
              setSelected(new Set())
            }}
          />
        </div>
      </div>
    </div>
  )
}
