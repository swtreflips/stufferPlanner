import type { ShipmentRow } from '../../types/shipment'
import type { Container } from '../../types/container'

export interface ShipmentRepo {
  fetchAll(): Promise<ShipmentRow[]>
  updateCargoReady(id: string, isoDate: string): Promise<void>
}

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
}
