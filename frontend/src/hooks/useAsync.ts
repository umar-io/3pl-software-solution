import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  error: string | null
  /** True only for the first load; background refreshes keep the old data. */
  loading: boolean
  refreshing: boolean
  reload: () => void
}

/**
 * Loads data with abort-on-change and stale-while-revalidate: when deps change
 * or `reload()` is called the previous data stays visible instead of flashing
 * a spinner. `pollMs` refreshes quietly in the background.
 */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
  pollMs?: number
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    const controller = new AbortController()
    setRefreshing(true)
    loadRef
      .current(controller.signal)
      .then((result) => {
        setData(result)
        setError(null)
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setError(err.message)
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  useEffect(() => {
    if (!pollMs) return
    const id = window.setInterval(() => setTick((n) => n + 1), pollMs)
    return () => window.clearInterval(id)
  }, [pollMs])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { data, error, loading, refreshing, reload }
}
