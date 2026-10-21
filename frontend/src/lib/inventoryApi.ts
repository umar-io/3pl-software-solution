import { API_BASE, parse } from './api'
import { authFetch } from './http'
import type {
  BreakdownResponse,
  HealthResponse,
  ReceivingResponse,
  ReviewStatus,
  Variance,
  VarianceListResponse,
  VarianceQuery,
} from '../types/inventory'

const BASE = `${API_BASE}/inventory`

function query(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await authFetch(`${BASE}${path}`, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new Error('Cannot reach the API. Is the backend running?')
  }
  return parse<T>(res)
}

export const inventoryApi = {
  health: (signal?: AbortSignal) => get<HealthResponse>('/health', signal),

  variances: (params: VarianceQuery, signal?: AbortSignal) =>
    get<VarianceListResponse>(`/variances${query(params)}`, signal),

  breakdown: (groupBy: 'client' | 'location', signal?: AbortSignal) =>
    get<BreakdownResponse>(`/breakdown${query({ group_by: groupBy })}`, signal),

  receiving: (signal?: AbortSignal) => get<ReceivingResponse>('/receiving', signal),

  async review(
    id: number,
    body: { status: ReviewStatus; note?: string }
  ): Promise<Variance> {
    const res = await authFetch(`${BASE}/variances/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return parse<Variance>(res)
  },

  async adjust(
    id: number,
    body: { expected: number; counted: number; reason: string }
  ): Promise<{ quantity_before: number; quantity_after: number; chatter_posted: boolean }> {
    const res = await authFetch(`${BASE}/variances/${id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return parse(res)
  },

  async sync(): Promise<{ last_synced_at: string; score: number }> {
    const res = await authFetch(`${BASE}/sync`, { method: 'POST' })
    return parse(res)
  },
}
