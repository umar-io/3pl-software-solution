import { useCallback, useState } from 'react'
import { inventoryApi } from '../lib/inventoryApi'
import { useToast } from '../components/ui/Toast'

/** Forces a fresh pull from Odoo, then re-runs the page's own loaders. */
export function useSyncAction(onDone: () => void) {
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)

  const sync = useCallback(async () => {
    setSyncing(true)
    try {
      await inventoryApi.sync()
      onDone()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSyncing(false)
    }
  }, [onDone, toast])

  return { sync, syncing }
}
