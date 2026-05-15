import type { OpenPoItem, OpenPoStatusReport } from '../../types/openPoItem'
import { sampleOpenPoStatusReport } from '../sampleData'
import type { OpenPoRepo } from './types'

export function createLocalOpenPoRepo(): OpenPoRepo {
  let rows: OpenPoItem[] = sampleOpenPoStatusReport.map((r) => ({ ...r }))

  return {
    async fetchAll(): Promise<OpenPoStatusReport> {
      return rows.map((r) => ({ ...r }))
    },
    async updateCargoReady(id, isoDate) {
      rows = rows.map((r) => (r.id === id ? { ...r, cargoReady: isoDate } : r))
    },
  }
}
