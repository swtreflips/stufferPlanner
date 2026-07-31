import type { MasterItem } from '../../types/masterItem'
import type {
  Container,
  ContainerBooking,
  ContainerSchedule,
  ContainerType,
  LogisticsStatus,
} from '../../types/container'
import type { Allocation } from '../../types/allocation'
import type { Supplier } from '../../types/supplier'
import type { Profile } from '../../types/profile'

export interface MasterItemRepo {
  fetchAll(): Promise<MasterItem[]>
  updateCargoReady(id: string, isoDate: string): Promise<void>
  updateCbmPerCase(id: string, value: number): Promise<void>
  commitQuantity(id: string, delta: number): Promise<void>
}

export interface SupplierRepo {
  fetchAll(): Promise<Supplier[]>
}

export interface ProfileRepo {
  fetchAll(): Promise<Profile[]>
  findById(id: string): Promise<Profile | null>

  /**
   * Every organization the signed-in user belongs to — their own, plus any sibling plant
   * sharing a group. Junsun Thailand and Qingdao Junsun are one commercial relationship run
   * out of two factories, so a Junsun user is entitled to both.
   *
   * Read from my_orgs(), which is the SAME function the RLS policies use. That is the point:
   * the switcher can never offer an organization whose rows the database would refuse, nor
   * hide one whose rows it returns. Deriving the list from the loaded data instead would
   * silently drop a sibling that happens to have no open POs this week.
   */
  fetchMyOrgIds(): Promise<string[]>
}

export interface CreateContainerInput {
  code: string
  name: string
  type: ContainerType
  destination: string
  supplierId: string
  capacityCbm: number | null
  displayOrder?: number
}

export interface LogisticsPatch {
  logisticsStatus?: LogisticsStatus | null
  bookedAt?: string | null
  bookedBy?: string | null
  booking?: ContainerBooking | null
  schedule?: ContainerSchedule | null
  scheduledAt?: string | null
  scheduledBy?: string | null
  shippedAt?: string | null
  shippedBy?: string | null
}

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
  create(input: CreateContainerInput): Promise<Container>
  delete(id: string): Promise<void>
  updateCapacity(id: string, capacityCbm: number): Promise<Container>
  commit(id: string, ofqReference: string, committedBy: string): Promise<Container>
  uncommit(id: string): Promise<Container>
  updateLogistics(id: string, patch: LogisticsPatch): Promise<Container>
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
