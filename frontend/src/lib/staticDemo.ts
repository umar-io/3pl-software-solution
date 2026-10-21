import type {
  BreakdownResponse,
  HealthResponse,
  ReceivingResponse,
  Variance,
  VarianceListResponse,
  VarianceQuery,
} from '../types/inventory'
import type { OrderDetail, OrderListResponse, OrderQuery } from './api'
import { queryOrders, queryVariances } from './staticQueries'

const BASE = `${import.meta.env.BASE_URL}demo-data`
const cache = new Map<string, Promise<unknown>>()

/** Fetch a pre-generated JSON file once and reuse it. */
function load<T>(path: string): Promise<T> {
  let hit = cache.get(path)
  if (!hit) {
    hit = fetch(`${BASE}/${path}`).then((res) => {
      if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : `Failed to load demo data (${res.status})`)
      return res.json()
    })
    hit.catch(() => cache.delete(path)) // allow a retry after a network error
    cache.set(path, hit)
  }
  return hit as Promise<T>
}

export const READ_ONLY_MESSAGE = 'This is a read-only demo. Run the project locally to try this action.'

export interface DemoMeta {
  as_of: string
}

export const staticDemo = {
  meta: () => load<DemoMeta>('meta.json'),
  health: () => load<HealthResponse>('health.json'),
  breakdown: (groupBy: 'client' | 'location') =>
    load<BreakdownResponse>(`breakdown-${groupBy}.json`),
  receiving: () => load<ReceivingResponse>('receiving.json'),

  async variances(params: VarianceQuery): Promise<VarianceListResponse> {
    const [all, meta, health] = await Promise.all([
      load<Variance[]>('variances.json'),
      load<DemoMeta>('meta.json'),
      load<HealthResponse>('health.json'),
    ])
    return queryVariances(all, params, meta.as_of, health.last_synced_at)
  },

  async orders(params: OrderQuery): Promise<OrderListResponse> {
    return queryOrders(await load<OrderListResponse>('orders.json'), params)
  },

  order: (id: number) => load<OrderDetail>(`orders/${id}.json`),
}
