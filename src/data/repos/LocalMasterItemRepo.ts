import type { MasterItem } from '../../types/masterItem'
import { sampleMasterItems } from '../sampleData'
import type { MasterItemRepo } from './types'

export function createLocalMasterItemRepo(): MasterItemRepo {
  let rows: MasterItem[] = sampleMasterItems.map((r) => ({ ...r }))

  return {
    async fetchAll(): Promise<MasterItem[]> {
      return rows.map((r) => ({ ...r }))
    },
    async updateCargoReady(id, isoDate) {
      rows = rows.map((r) => (r.id === id ? { ...r, cargoReady: isoDate } : r))
    },
    async updateCbmPerCase(id, value) {
      rows = rows.map((r) => (r.id === id ? { ...r, cbmPerCase: value } : r))
    },
    async setCommittedQuantity(id, quantity) {
      rows = rows.map((r) => (r.id === id ? { ...r, committedQuantity: quantity } : r))
    },

    /*
      The ERP sync has no local equivalent, and faking one would be worse than refusing.

      Every other method here is a believable stand-in because it touches one row in an array.
      The sync is a transaction that reconciles a whole snapshot, infers why lines left, writes
      history and enforces a blast radius — reimplementing that against `sampleMasterItems`
      would create a second, subtly different definition of what a sync means, and the local one
      would be the one nobody tested.

      So local mode says plainly that this needs the database. `VITE_DATA_SOURCE=local` still
      builds and the board still works; only Settings is unavailable, which is exactly true.
    */
    async previewSync() {
      throw new Error('Syncing PO lines needs the database — set VITE_DATA_SOURCE=supabase.')
    },
    async applySync() {
      throw new Error('Syncing PO lines needs the database — set VITE_DATA_SOURCE=supabase.')
    },
    async fetchClosures() {
      return []
    },
    async fetchImportBatches() {
      return []
    },
    async confirmClosureReason() {
      throw new Error('Confirming a closure needs the database — set VITE_DATA_SOURCE=supabase.')
    },
  }
}
