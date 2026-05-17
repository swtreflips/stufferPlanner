import type { MasterItem } from '../../types/masterItem'
import type { Container, ContainerType } from '../../types/container'
import type { Allocation } from '../../types/allocation'

export interface MasterItemRepo {
  fetchAll(): Promise<MasterItem[]>
  updateCargoReady(id: string, isoDate: string): Promise<void>
  commitQuantity(id: string, delta: number): Promise<void>
}

export interface CreateContainerInput {
  name: string
  type: ContainerType
  destination: string
  displayOrder?: number
}

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
  create(input: CreateContainerInput): Promise<Container>
  delete(id: string): Promise<void>
  commit(id: string, ofqReference: string): Promise<Container>
  uncommit(id: string): Promise<Container>
}

export interface CreateAllocationInput {
  containerId: string
  masterItemId: string
  quantity: number
  displayOrder?: number
}

export interface AllocationRepo {
  fetchAll(): Promise<Allocation[]>
  create(input: CreateAllocationInput): Promise<Allocation>
  update(id: string, quantity: number): Promise<void>
  delete(id: string): Promise<void>
  deleteByContainerId(containerId: string): Promise<void>
}
