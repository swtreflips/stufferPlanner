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
  }
}
