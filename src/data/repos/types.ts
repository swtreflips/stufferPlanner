import type { CbmSource, MasterItem } from '../../types/masterItem'
import type {
  Container,
  ContainerBooking,
  ContainerSchedule,
  ContainerType,
} from '../../types/container'
import type { Allocation } from '../../types/allocation'
import type { Supplier } from '../../types/supplier'
import type { Profile } from '../../types/profile'
import type { ContainerCapacity } from '../containerCapacity'
import type {
  Closure,
  ConfirmedReason,
  ImportBatch,
  SyncSummary,
} from '../../types/sync'
import type { SnapshotRow } from '../../utils/plannerInputParser'

/** The resolved CBM pair after a write, plus which figure is now the stored one. */
export interface CbmFigures {
  cbmPerCase: number
  cbmTotal: number
  cbmSource: CbmSource
}

export interface MasterItemRepo {
  fetchAll(): Promise<MasterItem[]>
  updateCargoReady(id: string, isoDate: string): Promise<void>

  /*
    SUPPLY ONE, THE OTHER IS DERIVED — and each write clears its sibling.

    cbm_per_case_eff / cbm_total_eff are generated columns and cbm_per_case wins when both raw
    figures are set, so writing a total without clearing the per-case would change nothing on
    screen. Clearing makes the edit take effect, and makes "which one did somebody measure" a
    real property of the row rather than an accident of write order.

    Both return the RESOLVED pair straight from the database, which is what lets the sibling
    column update without a reload and keeps every CBM calculation out of the client.
  */
  updateCbmPerCase(id: string, value: number): Promise<CbmFigures>
  updateCbmTotal(id: string, value: number): Promise<CbmFigures>
  /**
   * Set committed quantity ABSOLUTELY, never by delta.
   *
   * This was `commitQuantity(id, delta)` — a read-then-write applying +n on commit and -n on
   * uncommit. Every delta had to fire exactly once, in order, and never interleave; when one
   * did not, the error was permanent and silent. It is now computed from the allocations that
   * are actually committed, so a write that is missed or repeated cannot drift anything.
   */
  setCommittedQuantity(id: string, quantity: number): Promise<void>

  /*
    THE WEEKLY ERP SNAPSHOT.

    `previewSync` and `applySync` take the identical argument and return the identical shape,
    because server-side they are two entry points onto one diff function. The preview is not a
    simulation of the apply — it is the same calculation with the writing half left off, which
    is the only arrangement where a confirm screen can promise what will happen.

    Neither takes an actor: `sync_po_lines` reads auth.uid() itself and refuses anyone who is
    not internal, so the panel that calls this cannot widen who may push data by passing a
    different id.
  */
  previewSync(rows: SnapshotRow[]): Promise<SyncSummary>
  applySync(rows: SnapshotRow[], force: boolean): Promise<SyncSummary>

  fetchClosures(): Promise<Closure[]>
  fetchImportBatches(limit: number): Promise<ImportBatch[]>

  /**
   * Replaces the sync's GUESS with what a person established. Writes only the confirmed
   * columns — the inference is left exactly as it was, so "what did the system think, and was
   * it right" stays answerable.
   */
  confirmClosureReason(
    lineId: string,
    reason: ConfirmedReason,
    note: string | null,
  ): Promise<void>
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
  /*
    NO `code` FIELD. The container number is issued by the persistence layer, not chosen by the
    caller — it used to come from an in-memory counter in the store that reset on every page
    load, so the first container added for a supplier that already had one re-issued its number
    and hit the UNIQUE constraint. Numbering is state; state belongs where state lives.
    `supplierCode` is the organization's two-letter prefix the number is issued against.
  */
  supplierCode: string
  name: string
  type: ContainerType
  destination: string
  supplierId: string
  capacityCbm: number | null
  displayOrder?: number
}

/** How full a container currently is — for the capacity panel's pre-save impact check. */
export interface ContainerFill {
  code: string
  type: ContainerType
  status: string
  totalCbm: number
}

export interface ContainerRepo {
  fetchAll(): Promise<Container[]>
  create(input: CreateContainerInput): Promise<Container>
  delete(id: string): Promise<void>

  /** The per-container operational cap, edited on the card. Not the type-wide limits below. */
  updateCapacity(id: string, capacityCbm: number): Promise<Container>

  /*
    TYPE-WIDE CBM LIMITS — planner_container_capacity.

    Distinct from `updateCapacity` above, which moves ONE container's cap. These are the numbers
    every future container of that type is born with, plus the structural ceiling allocation is
    refused past.

    Changing them is NOT retroactive: planner_containers.capacity_cbm is stamped at creation, so
    raising the 40HC default leaves every existing plan exactly as its planner left it.
  */
  fetchTypeCapacities(): Promise<Partial<Record<ContainerType, ContainerCapacity>>>
  updateTypeCapacity(
    type: ContainerType,
    capacity: ContainerCapacity,
  ): Promise<ContainerCapacity>

  /** Current fill of every container this user can see. Used to warn before LOWERING a ceiling. */
  fetchFill(): Promise<ContainerFill[]>

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
