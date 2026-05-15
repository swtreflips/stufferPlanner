import type { OpenPoStatusReport } from '../../types/openPoItem'
import type { Container } from '../../types/container'

export interface OpenPoRepo {
  fetchAll(): Promise<OpenPoStatusReport>
  updateCargoReady(id: string, isoDate: string): Promise<void>
}

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
}
