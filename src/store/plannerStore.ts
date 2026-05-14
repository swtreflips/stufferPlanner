import { create } from 'zustand'
import type { ShipmentRow } from '../types/shipment'
import type { Container } from '../types/container'
import { containerRepo, shipmentRepo } from '../data/repos'

interface PlannerStore {
  shipments: ShipmentRow[]
  containers: Container[]
}

export const usePlannerStore = create<PlannerStore>((set) => {
  shipmentRepo.fetchAll().then((shipments) => set({ shipments }))
  containerRepo.fetchAll().then((containers) => set({ containers }))

  return {
    shipments: [],
    containers: [],
  }
})
