import type { MasterItem } from '../../types/masterItem'
import type { Container, ContainerType } from '../../types/container'
import type { Allocation } from '../../types/allocation'
import type { Supplier } from '../../types/supplier'
import type { Profile } from '../../types/profile'

export interface MasterItemRepo {
  fetchAll(): Promise<MasterItem[]>
  updateCargoReady(id: string, isoDate: string): Promise<void>
  commitQuantity(id: string, delta: number): Promise<void>
}

export interface SupplierRepo {
  fetchAll(): Promise<Supplier[]>
}

export interface ProfileRepo {
  fetchAll(): Promise<Profile[]>
  findById(id: string): Promise<Profile | null>
}

export interface CreateContainerInput {
  code: string
  name: string
  type: ContainerType
  destination: string
  supplierId: string
  displayOrder?: number
}

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
  create(input: CreateContainerInput): Promise<Container>
  delete(id: string): Promise<void>
  commit(id: string, ofqReference: string, committedBy: string): Promise<Container>
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
  updateContainerId(id: string, newContainerId: string): Promise<void>
  delete(id: string): Promise<void>
  deleteByContainerId(containerId: string): Promise<void>
}
