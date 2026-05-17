import type { MasterItem } from '../../types/masterItem'
import type { Container, ContainerType } from '../../types/container'
import type { Scenario } from '../../types/scenario'
import type { Allocation } from '../../types/allocation'

export interface MasterItemRepo {
  fetchAll(): Promise<MasterItem[]>
  updateCargoReady(id: string, isoDate: string): Promise<void>
}

export interface CreateScenarioInput {
  name: string
  parentId: string | null
  createdBy: string
}

export interface ScenarioRepo {
  fetchAll(): Promise<Scenario[]>
  create(input: CreateScenarioInput): Promise<Scenario>
}

export interface CreateContainerInput {
  name: string
  type: ContainerType
  destination: string
  scenarioId: string
  createdBy: string
  displayOrder?: number
}

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
  create(input: CreateContainerInput): Promise<Container>
  delete(id: string): Promise<void>
}

export interface CreateAllocationInput {
  containerId: string
  masterItemId: string
  quantity: number
  createdBy: string
  displayOrder?: number
}

export interface AllocationRepo {
  fetchAll(): Promise<Allocation[]>
  create(input: CreateAllocationInput): Promise<Allocation>
  update(id: string, quantity: number): Promise<void>
  delete(id: string): Promise<void>
  deleteByContainerId(containerId: string): Promise<void>
}
