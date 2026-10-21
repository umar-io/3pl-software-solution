import { STATIC_DEMO } from './demo'
import { authFetch } from './http'
import { READ_ONLY_MESSAGE, staticDemo } from './staticDemo'
// Override at build time with VITE_API_BASE (e.g. https://my-api.run.app/api).
export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? 'http://localhost:8005/api'

export type FulfillmentStatus =
  | 'pending'
  | 'received'
  | 'picking'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'

export interface OrderSummary {
  id: number
  name: string
  ref: string
  partner_id: number | null
  partner_name: string
  amount_total: number
  state: string
  date_order: string | null
  age_hours: number | null
  fulfillment_status: FulfillmentStatus
  merchant: string
  carrier: string | null
  tracking_number: string | null
  created_at: string | null
}

export interface OrderLine {
  id: number
  product: string
  name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface OrderEvent {
  id: number
  from_status: string | null
  to_status: string
  note: string | null
  actor: string
  created_at: string | null
}

export interface Shipping {
  id: number | null
  name: string
  email: string
  phone: string
  street: string
  street2: string
  city: string
  zip: string
  state: string
  country: string
}

export interface OrderDetail extends OrderSummary {
  shipping: Shipping
  lines: OrderLine[]
  events: OrderEvent[]
}

export interface OrderListResponse {
  items: OrderSummary[]
  total: number
  counts: Record<string, number>
  merchants: string[]
  last_synced_at: string | null
}

export interface Writeback {
  attempted: boolean
  ok: boolean
  error?: string
}

export interface StatusUpdateResponse {
  message: string
  fulfillment_status: FulfillmentStatus
  carrier: string | null
  tracking_number: string | null
  odoo_writeback: Writeback
}

export interface BulkAdvanceResponse {
  advanced: number
  results: { id: number; ok: boolean; fulfillment_status?: string; error?: string }[]
}

export interface OrderQuery {
  status?: string
  q?: string
  merchant?: string
  limit?: number
  offset?: number
}

// Mirrors the backend guardrails so the UI only offers legal moves.
export const ALLOWED_TRANSITIONS: Record<string, FulfillmentStatus[]> = {
  pending: ['picking', 'cancelled'],
  received: ['picking', 'cancelled'],
  picking: ['packed', 'cancelled'],
  packed: ['dispatched', 'cancelled'],
  dispatched: ['delivered'],
  delivered: [],
  cancelled: [],
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  received: 'Received',
  picking: 'Picking',
  packed: 'Packed',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const STATUS_ORDER: FulfillmentStatus[] = [
  'received',
  'picking',
  'packed',
  'dispatched',
  'delivered',
  'cancelled',
]

export const TERMINAL_STATUSES: FulfillmentStatus[] = ['delivered', 'cancelled']

function buildQuery(params: OrderQuery): string {
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.merchant) search.set('merchant', params.merchant)
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export async function parse<T>(res: Response): Promise<T> {
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const detail =
      typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`
    throw new Error(detail)
  }
  return body as T
}

export async function fetchOrders(params: OrderQuery = {}): Promise<OrderListResponse> {
  if (STATIC_DEMO) return staticDemo.orders(params)
  const res = await authFetch(`${API_BASE}/orders/${buildQuery(params)}`)
  return parse<OrderListResponse>(res)
}

export async function fetchOrder(id: number): Promise<OrderDetail> {
  if (STATIC_DEMO) {
    return staticDemo.order(id).catch(() => {
      throw new Error('Order not found')
    })
  }
  const res = await authFetch(`${API_BASE}/orders/${id}`)
  return parse<OrderDetail>(res)
}

export async function syncOrders(): Promise<{
  scanned: number
  created: number
  updated: number
  events_backfilled: number
  skipped: number
  last_synced_at: string
}> {
  if (STATIC_DEMO) throw new Error(READ_ONLY_MESSAGE)
  const res = await authFetch(`${API_BASE}/orders/sync`, { method: 'POST' })
  return parse(res)
}

export async function updateOrderStatus(
  id: number,
  action: string,
  body: { carrier?: string; tracking_number?: string; actor?: string } = {}
): Promise<StatusUpdateResponse> {
  if (STATIC_DEMO) throw new Error(READ_ONLY_MESSAGE)
  const res = await authFetch(`${API_BASE}/orders/${id}/${action}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parse<StatusUpdateResponse>(res)
}

export async function bulkAdvance(
  ids: number[],
  actor: string
): Promise<BulkAdvanceResponse> {
  if (STATIC_DEMO) throw new Error(READ_ONLY_MESSAGE)
  const res = await authFetch(`${API_BASE}/orders/bulk-advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, actor }),
  })
  return parse<BulkAdvanceResponse>(res)
}
