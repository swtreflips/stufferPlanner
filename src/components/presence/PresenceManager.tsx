import { useEffect } from 'react'
import { usePlannerStore } from '../../store/plannerStore'

const HEARTBEAT_MS = 20_000
const SWEEP_MS = 5_000

// Mounted once in AppLayout. Owns the heartbeat (refreshes our own locks so
// they don't expire mid-edit) and the sweeper (removes expired locks from
// dead tabs).
export default function PresenceManager() {
  const heldLocks = usePlannerStore((s) => s.heldLocks)
  const refreshLock = usePlannerStore((s) => s.refreshLock)
  const sweepExpiredLocks = usePlannerStore((s) => s.sweepExpiredLocks)

  useEffect(() => {
    const heartbeat = setInterval(() => {
      for (const lock of heldLocks()) {
        refreshLock(lock.resourceId)
      }
    }, HEARTBEAT_MS)
    const sweeper = setInterval(() => {
      sweepExpiredLocks()
    }, SWEEP_MS)
    return () => {
      clearInterval(heartbeat)
      clearInterval(sweeper)
    }
  }, [heldLocks, refreshLock, sweepExpiredLocks])

  return null
}
