import type { OpenPoItem } from '../../types/openPoItem'
import type { Container } from '../../types/container'

export interface OpenPoRepo {
  fetchAll(): Promise<OpenPoItem[]>
  updateCargoReady(id: string, isoDate: string): Promise<void>
}

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
}
