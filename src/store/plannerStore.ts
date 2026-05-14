import { create } from 'zustand'
import type { ShipmentRow } from '../types/shipment'
import type { Container } from '../types/container'
import { sampleShipments } from '../data/sampleData'

interface PlannerStore {
  shipments: ShipmentRow[]
  containers: Container[]
}

export const usePlannerStore = create<PlannerStore>(() => ({
  shipments: sampleShipments,
  containers: [],
}))
