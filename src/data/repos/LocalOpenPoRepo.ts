import type { OpenPoItem } from '../../types/openPoItem'
import { sampleOpenPoItems } from '../sampleData'
import type { OpenPoRepo } from './types'

export function createLocalOpenPoRepo(): OpenPoRepo {
  let rows: OpenPoItem[] = sampleOpenPoItems.map((r) => ({ ...r }))

  return {
    async fetchAll(): Promise<OpenPoItem[]> {
      return rows.map((r) => ({ ...r }))
    },
    async updateCargoReady(id, isoDate) {
      rows = rows.map((r) => (r.id === id ? { ...r, cargoReady: isoDate } : r))
    },
  }
}
