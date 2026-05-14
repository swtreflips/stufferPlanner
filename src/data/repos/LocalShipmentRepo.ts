import type { ShipmentRow } from '../../types/shipment'
import { sampleShipments } from '../sampleData'
import type { ShipmentRepo } from './types'

export function createLocalShipmentRepo(): ShipmentRepo {
  let rows: ShipmentRow[] = sampleShipments.map((r) => ({ ...r }))

  return {
    async fetchAll() {
      return rows.map((r) => ({ ...r }))
    },
    async updateCargoReady(id, isoDate) {
      rows = rows.map((r) => (r.id === id ? { ...r, cargoReady: isoDate } : r))
    },
  }
}
