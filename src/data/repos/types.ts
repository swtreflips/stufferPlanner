import type { MasterItem } from '../../types/masterItem'
import type {
  Container,
  ContainerBooking,
  ContainerSchedule,
  ContainerType,
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

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
  create(input: CreateContainerInput): Promise<Container>
  delete(id: string): Promise<void>
  updateCapacity(id: string, capacityCbm: number): Promise<Container>

  /*
    The lifecycle is named transitions, not a generic patch.

    `updateLogistics(id, patch)` let a caller write any combination of status and stamps, which
    meant the state machine had to live in the store — `if (logisticsStatus !== 'committed')
    return` — a business rule in React that the database knew nothing about. These methods each
    map to one SECURITY DEFINER function carrying its own source-state guard, so the sequence is
    enforced where it cannot be bypassed.

    NONE OF THEM TAKE AN ACTOR ID. Identity is read from auth.uid() server-side. It used to be
    passed from the client, so `booked_by` recorded what the browser claimed rather than who
    acted — forgeable, and wrong by accident the first time a stale id was passed.
  */
  commit(id: string, ofqReference: string): Promise<Container>
  uncommit(id: string): Promise<Container>
  book(id: string, booking: ContainerBooking): Promise<Container>
  unbook(id: string): Promise<Container>
  reviseBooking(id: string, booking: ContainerBooking): Promise<Container>
  schedule(id: string, schedule: ContainerSchedule): Promise<Container>
  unschedule(id: string): Promise<Container>
  ship(id: string): Promise<Container>
  unship(id: string): Promise<Container>
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
