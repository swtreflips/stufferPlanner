import { create } from 'zustand'
import type { MasterItem } from '../types/masterItem'
import type {
  Container,
  ContainerBooking,
  ContainerSchedule,
  ContainerType,
} from '../types/container'
import type { Allocation, AllocationDialogMode } from '../types/allocation'
import type { Profile } from '../types/profile'
import type { Supplier } from '../types/supplier'
import type { LockEntry, PresenceMessage } from '../types/lock'
import {
  allocationRepo,
  containerRepo,
  masterItemRepo,
  profileRepo,
  supplierRepo,
} from '../data/repos'
import { createPresenceChannel } from '../data/presenceChannel'
import {
  CbmCeilingError,
  exceedsCeiling,
  getCapacityConfig,
  setCapacities,
} from '../data/containerCapacity'

const LOCK_TTL_MS = 60_000
const SESSION_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`

interface CreateContainerArgs {
  name: string
  type: ContainerType
  destination: string
  supplierId: string
}

interface AddAllocationArgs {
  containerId: string
  masterItemId: string
  quantity: number
}

interface AllocationDialogState {
  open: boolean
  mode: AllocationDialogMode | null
}

interface CommitDialogState {
  open: boolean
  containerId: string | null
}

interface LogisticsDialogState {
  open: boolean
  containerId: string | null
}

interface CsvUploadDialogState {
  open: boolean
}

interface PlannerStore {
  masterItems: MasterItem[]
  containers: Container[]
  allocations: Allocation[]
  suppliers: Supplier[]
  profiles: Profile[]
  allocationDialog: AllocationDialogState
  commitDialog: CommitDialogState
  logisticsDialog: LogisticsDialogState
  csvUploadDialog: CsvUploadDialogState

  // "Saved" feedback for inline master-grid edits. Key shape:
  // `${masterItemId}:${field}`. Set briefly after a successful write so the
  // grid can flash the cell teal; cleared by a timer in markSaved.
  recentlySavedKey: string | null

  // Admin/Internal supplier focus. null = all suppliers (default). Pure UI
  // state — factory scoping is handled separately via user.supplierId.
  supplierFilterId: string | null

  // Live editing presence
  locks: Record<string, LockEntry>
  mySessionId: string

  // Data loading. `hydrate` must be called by a component INSIDE the auth gate — see the
  // note on the store creator. `loadError` surfaces a failed fetch, which otherwise looks
  // exactly like an empty board.
  hydrated: boolean
  loadError: string | null
  hydrate(user: Profile): Promise<void>

  // Every organization the signed-in user belongs to: their own plus any sibling plant.
  // Read from my_orgs(), the same function RLS uses, so it can never disagree with the rows
  // that actually came back. Length > 1 is what makes a user a group user.
  myOrgIds: string[]

  createContainer(args: CreateContainerArgs): Promise<void>
  deleteContainer(id: string): Promise<void>
  emptyContainer(id: string): Promise<void>
  updateContainerCapacity(id: string, capacityCbm: number): Promise<void>

  addAllocation(input: AddAllocationArgs): Promise<Allocation>
  updateAllocation(id: string, quantity: number): Promise<void>
  removeAllocation(id: string): Promise<void>
  /**
   * Split a line: leave `keep` where it is and send the remainder to `toContainerId`, or back to
   * the master pool when that is null.
   *
   * The one operation behind every destination the allocation dialog offers. It replaced
   * `moveAllocation`, which moved a whole line between containers and could not express "move
   * 500 of the 3500" — the thing a destination picker plus a quantity necessarily means.
   *
   * Returning to the pool needs no deposit step: `availableQty` derives availability by
   * subtracting draft allocations, so reducing this one hands the cases back by arithmetic.
   */
  splitAllocation(
    allocationId: string,
    keep: number,
    toContainerId: string | null,
  ): Promise<void>

  // Factory-owned master-data edits. Inline grid + CSV upload both route here.
  updateMasterCargoReady(id: string, isoDate: string): Promise<void>
  updateMasterCbmPerCase(id: string, value: number): Promise<void>
  updateMasterCbmTotal(id: string, value: number): Promise<void>
  markSaved(key: string): void

  commitContainer(id: string, ofqReference: string): Promise<void>
  uncommitContainer(id: string): Promise<void>

  // Post-commit lifecycle. Each maps to one SECURITY DEFINER function that guards its own
  // source state and stamps auth.uid() itself — so neither the sequence nor the identity is
  // decided by the client. A refused transition throws with the database's reason.
  markContainerBooked(id: string, booking: ContainerBooking): Promise<void>
  updateContainerBooking(id: string, booking: ContainerBooking): Promise<void>
  unmarkContainerBooked(id: string): Promise<void>
  setContainerSchedule(id: string, schedule: ContainerSchedule): Promise<void>
  clearContainerSchedule(id: string): Promise<void>
  markContainerShipped(id: string): Promise<void>
  unmarkContainerShipped(id: string): Promise<void>

  openAllocationDialog(mode: AllocationDialogMode): void
  closeAllocationDialog(): void
  openCommitDialog(containerId: string): void
  closeCommitDialog(): void
  openLogisticsDialog(containerId: string): void
  closeLogisticsDialog(): void
  openCsvUploadDialog(): void
  closeCsvUploadDialog(): void
  setSupplierFilter(supplierId: string | null): void

  acquireLock(resourceId: string, user: { id: string; displayName: string }): boolean
  releaseLock(resourceId: string): void
  refreshLock(resourceId: string): void
  applyPresenceMessage(msg: PresenceMessage): void
  sweepExpiredLocks(): void
  isLockedByOther(resourceId: string): LockEntry | null
  isLockedByMe(resourceId: string): boolean
  heldLocks(): LockEntry[]

  /**
   * Recompute `committedQuantity` from what is actually committed, and write back any drift.
   *
   * DERIVED, NOT ACCUMULATED. This was maintained by applying deltas — `+250` on commit, `-250`
   * on uncommit — as a read-then-write with no transaction around it. Every one had to fire
   * exactly once, in order, and never overlap. They did not: three PO lines were left holding
   * 349 cases committed against zero containers, one of them at 149 of a 150 that had been
   * reversed. A line at 100 of 100 committed then disappears from the grid, so the failure hides
   * the evidence of itself.
   *
   * Truth is `Σ allocations sitting in COMMITTED containers`. Computing it means a missed or
   * doubled write cannot drift anything, and running it twice changes nothing — which is what
   * also makes it the repair for damage already done.
   *
   * Pass the ids worth checking, or nothing to sweep every line.
   */
  reconcileCommitted(masterItemIds?: string[]): Promise<void>

  availableQty(masterItemId: string): number
  containerCbm(containerId: string, excludeAllocationId?: string | null): number
  containersHoldingItem(masterItemId: string): Container[]
  eligibleContainersForMasterItem(masterItemId: string): Container[]
  displayNameById(userId: string | null): string
}

const presence = createPresenceChannel()

export const usePlannerStore = create<PlannerStore>((set, get) => {
  // NOTHING IS FETCHED HERE. This initializer runs when the module is first imported —
  // at app start, before anyone has signed in. Against the local repos that was harmless:
  // in-memory sample data, no identity involved. Against Supabase it is silently fatal.
  // The five requests go out unauthenticated, RLS correctly returns nothing, and the board
  // stays empty forever because a store creator runs exactly once and never retries.
  //
  // An empty result is not an error, which is what makes this so quiet: no exception, no
  // failed request, no console output — a working app showing zero rows.
  //
  // Loading is now `hydrate()`, called from AppLayout, which only mounts once AuthProvider
  // has a session AND a profile. Keyed on the user id, so switching accounts refetches
  // rather than showing the previous person's rows.

  // Subscribe to cross-tab presence and request an initial snapshot.
  presence.subscribe((msg) => get().applyPresenceMessage(msg))
  presence.send({ type: 'snapshot-request' })

  return {
    hydrated: false,
    loadError: null,
    myOrgIds: [],

    async hydrate(user: Profile) {
      // Every repo is fetched together and applied together. A partial board — PO lines
      // without the suppliers they belong to — renders blank supplier names that read as
      // missing data rather than a failed load.
      try {
        const [masterItems, containers, allocations, suppliers, profiles, myOrgIds, capacities] =
          await Promise.all([
            masterItemRepo.fetchAll(),
            containerRepo.fetchAll(),
            allocationRepo.fetchAll(),
            supplierRepo.fetchAll(),
            profileRepo.fetchAll(),
            profileRepo.fetchMyOrgIds(),
            containerRepo.fetchTypeCapacities(),
          ])

        /*
          Installed BEFORE the board is set, so nothing draws a fill bar or runs a ceiling check
          against the compiled-in fallbacks. Kept OUT of store state deliberately: capacity is
          read synchronously by the allocation guards and by every card, and routing it through
          a selector would re-render thirteen call sites for a value that changes twice a year.
        */
        setCapacities(capacities)

        /*
          supplierFilterId is seeded here, and it resets on every hydrate — hydrate reruns when
          the user changes, and carrying a previous account's focus across a sign-in would
          silently narrow the board to an organization the new person may not belong to.

          AN EXTERNAL USER ALWAYS HAS EXACTLY ONE PLANT SELECTED. The grid no longer carries a
          supplier column, so "all plants" would show a multi-plant supplier 34 rows with nothing
          saying which are Thailand and which are Qingdao. The dropdown IS the attribution, which
          only works if it always names one plant. Internal keeps null — they have the column.
        */
        const isExternal = user.role === 'factory'
        set({
          masterItems, containers, allocations, suppliers, profiles, myOrgIds,
          supplierFilterId: isExternal ? (user.supplierId ?? myOrgIds[0] ?? null) : null,
          hydrated: true, loadError: null,
        })
      } catch (e: unknown) {
        // Surface it. The previous code used bare .then() with no .catch, so a rejected
        // fetch produced an unhandled rejection and an empty grid — indistinguishable
        // from "there is genuinely no work to show".
        set({ hydrated: true, loadError: e instanceof Error ? e.message : String(e) })
      }
    },

    masterItems: [],
    containers: [],
    allocations: [],
    suppliers: [],
    profiles: [],
    allocationDialog: { open: false, mode: null },
    commitDialog: { open: false, containerId: null },
    logisticsDialog: { open: false, containerId: null },
    csvUploadDialog: { open: false },
    recentlySavedKey: null,
    supplierFilterId: null,
    locks: {},
    mySessionId: SESSION_ID,

    /*
      The container NUMBER is no longer minted here. It came from an in-memory counter that
      started empty on every page load and never looked at the containers already loaded, so
      adding one for a supplier that already had a container re-issued its number and the UNIQUE
      constraint on `code` rejected it. It only failed for suppliers with an existing container,
      which is exactly why it looked arbitrary.

      Numbering is persistent state, so it belongs where the state lives: the repository asks
      next_container_code, which advances the sequence atomically.
    */
    async createContainer({ name, type, destination, supplierId }) {
      const supplier = get().suppliers.find((s) => s.id === supplierId)
      if (!supplier) throw new Error(`createContainer: unknown supplier ${supplierId}`)
      const container = await containerRepo.create({
        supplierCode: supplier.code.toUpperCase(),
        name,
        type,
        destination,
        supplierId,
        capacityCbm: getCapacityConfig(type)?.defaultOperationalCbm ?? null,
      })
      set((s) => ({ containers: [...s.containers, container] }))
    },

    async deleteContainer(id) {
      const affected = get()
        .allocations.filter((a) => a.containerId === id)
        .map((a) => a.masterItemId)

      await allocationRepo.deleteByContainerId(id)
      await containerRepo.delete(id)
      set((s) => ({
        containers: s.containers.filter((c) => c.id !== id),
        allocations: s.allocations.filter((a) => a.containerId !== id),
      }))

      /*
        This reversed NOTHING before. Deleting a committed container removed the container and
        its allocations while leaving their cases marked committed on the PO lines — with nothing
        left pointing at them, and no way to notice, because a line at 100 of 100 committed drops
        off the grid entirely.

        Deleting a DRAFT needs no correction — draft allocations never counted toward committed
        quantity, and `availableQty` subtracts them live, so the cases come back the moment the
        rows go. Running the reconcile anyway costs one read and removes the need for the caller
        to know which case it is in.
      */
      await get().reconcileCommitted(affected)
    },

    async emptyContainer(containerId) {
      const affected = get()
        .allocations.filter((a) => a.containerId === containerId)
        .map((a) => a.masterItemId)
      await allocationRepo.deleteByContainerId(containerId)
      set((s) => ({
        allocations: s.allocations.filter((a) => a.containerId !== containerId),
      }))
      await get().reconcileCommitted(affected)
    },

    async updateContainerCapacity(id, capacityCbm) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.status !== 'draft') return
      const updated = await containerRepo.updateCapacity(id, capacityCbm)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async addAllocation({ containerId, masterItemId, quantity }) {
      const existing = get().allocations.find(
        (a) => a.containerId === containerId && a.masterItemId === masterItemId,
      )
      const container = get().containers.find((c) => c.id === containerId)
      const item = get().masterItems.find((m) => m.id === masterItemId)
      if (container && item) {
        const finalQuantity = (existing?.quantity ?? 0) + quantity
        const otherCbm = get().containerCbm(containerId, existing?.id ?? null)
        const projected = otherCbm + item.cbmPerCase * finalQuantity
        if (exceedsCeiling(container.type, projected)) {
          const config = getCapacityConfig(container.type)
          throw new CbmCeilingError(
            `Allocation would exceed the ${container.type} structural ceiling of ${config?.maxCbm} m³.`,
          )
        }
      }
      if (existing) {
        const newQuantity = existing.quantity + quantity
        await allocationRepo.update(existing.id, newQuantity)
        set((s) => ({
          allocations: s.allocations.map((a) =>
            a.id === existing.id ? { ...a, quantity: newQuantity } : a,
          ),
        }))
        return { ...existing, quantity: newQuantity }
      }
      const allocation = await allocationRepo.create({
        containerId,
        masterItemId,
        quantity,
      })
      set((s) => ({ allocations: [...s.allocations, allocation] }))
      return allocation
    },

    async updateAllocation(id, quantity) {
      const allocation = get().allocations.find((a) => a.id === id)
      if (allocation) {
        const container = get().containers.find(
          (c) => c.id === allocation.containerId,
        )
        const item = get().masterItems.find(
          (m) => m.id === allocation.masterItemId,
        )
        if (container && item) {
          const otherCbm = get().containerCbm(allocation.containerId, id)
          const projected = otherCbm + item.cbmPerCase * quantity
          if (exceedsCeiling(container.type, projected)) {
            const config = getCapacityConfig(container.type)
            throw new CbmCeilingError(
              `Update would exceed the ${container.type} structural ceiling of ${config?.maxCbm} m³.`,
            )
          }
        }
      }
      await allocationRepo.update(id, quantity)
      set((s) => ({
        allocations: s.allocations.map((a) =>
          a.id === id ? { ...a, quantity } : a,
        ),
      }))
    },

    async removeAllocation(id) {
      await allocationRepo.delete(id)
      set((s) => ({ allocations: s.allocations.filter((a) => a.id !== id) }))
    },

    async splitAllocation(allocationId, keep, toContainerId) {
      const allocation = get().allocations.find((a) => a.id === allocationId)
      if (!allocation) return

      /*
        BACK TO THE MASTER POOL is just this line getting smaller. Nothing needs depositing —
        availableQty subtracts draft allocations, so the cases are free the moment this one
        shrinks. Delegating to the existing actions rather than writing a second reduction path
        keeps the CBM ceiling check in one place, and lets `keep` exceed the current quantity
        (drawing more IN) without a special case.
      */
      if (toContainerId === null) {
        if (keep <= 0) return get().removeAllocation(allocationId)
        return get().updateAllocation(allocationId, keep)
      }

      const moved = allocation.quantity - keep
      if (moved <= 0) return

      const item = get().masterItems.find((m) => m.id === allocation.masterItemId)
      const target = get().containers.find((c) => c.id === toContainerId)
      if (!item || !target || target.status !== 'draft') return
      if (item.shipTo !== target.destination) return
      if (item.supplierId !== target.supplierId) return

      /*
        Checked BEFORE anything is written. These are two round trips with no transaction around
        them, so a ceiling rejection discovered halfway would leave the cases having left the
        source and never arrived — the one outcome worse than refusing the move.
      */
      const projected = get().containerCbm(toContainerId) + item.cbmPerCase * moved
      if (exceedsCeiling(target.type, projected)) {
        const config = getCapacityConfig(target.type)
        throw new CbmCeilingError(
          `Moving ${moved} cases would exceed ${target.code}'s ${target.type} structural ceiling of ${config?.maxCbm} m³.`,
        )
      }

      // Source first, so the cases are available before they are claimed again.
      if (keep <= 0) await get().removeAllocation(allocationId)
      else await get().updateAllocation(allocationId, keep)

      await get().addAllocation({
        containerId: toContainerId,
        masterItemId: allocation.masterItemId,
        quantity: moved,
      })
    },

    async commitContainer(id, ofqReference) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.status !== 'draft') return
      const containerAllocations = get().allocations.filter(
        (a) => a.containerId === id,
      )
      if (containerAllocations.length === 0) return

      const committed = await containerRepo.commit(id, ofqReference)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? committed : c)),
      }))

      /*
        Committed quantity is RECOMPUTED, not incremented.

        This applied a delta per item. A delta has to land exactly once, in order, and never
        interleave with another — and when one did not, nothing said so and the line stayed
        wrong permanently. Deriving the figure from the allocations that are actually committed
        makes a lost or repeated write harmless, and makes this the repair as well as the update.
      */
      await get().reconcileCommitted(containerAllocations.map((a) => a.masterItemId))
    },

    async uncommitContainer(id) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.status !== 'committed') return
      // "Roll the logistics back before uncommitting" is enforced by uncommit_container now,
      // not here — it guards the most destructive action in the app, and a rule the client alone
      // believes is a rule a direct API call ignores.
      const containerAllocations = get().allocations.filter(
        (a) => a.containerId === id,
      )

      const reverted = await containerRepo.uncommit(id)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? reverted : c)),
      }))

      // The same recompute as commit, in the direction where the delta version actually failed:
      // one line came back holding 149 of a 150 that had been fully reversed.
      await get().reconcileCommitted(containerAllocations.map((a) => a.masterItemId))
    },

    openAllocationDialog(mode) {
      set({ allocationDialog: { open: true, mode } })
    },
    closeAllocationDialog() {
      set({ allocationDialog: { open: false, mode: null } })
    },
    openCommitDialog(containerId) {
      set({ commitDialog: { open: true, containerId } })
    },
    closeCommitDialog() {
      set({ commitDialog: { open: false, containerId: null } })
    },
    openLogisticsDialog(containerId) {
      set({ logisticsDialog: { open: true, containerId } })
    },
    closeLogisticsDialog() {
      set({ logisticsDialog: { open: false, containerId: null } })
    },
    openCsvUploadDialog() {
      set({ csvUploadDialog: { open: true } })
    },
    closeCsvUploadDialog() {
      set({ csvUploadDialog: { open: false } })
    },
    setSupplierFilter(supplierId) {
      set({ supplierFilterId: supplierId })
    },

    async updateMasterCargoReady(id, isoDate) {
      await masterItemRepo.updateCargoReady(id, isoDate)
      set((s) => ({
        masterItems: s.masterItems.map((m) =>
          m.id === id ? { ...m, cargoReady: isoDate } : m,
        ),
      }))
      get().markSaved(`${id}:cargoReady`)
    },
    /*
      Both CBM edits merge the RESOLVED pair the database sent back, which is what makes the
      other column fill immediately.

      This previously patched only the field that was typed, so the sibling kept whatever value
      it had been fetched with until someone reloaded — the derived number silently disagreeing
      with the one it was derived from. Nothing here recomputes it: the figures come from the
      generated columns, so the client cannot drift from the definition or get the divisor wrong.
    */
    async updateMasterCbmPerCase(id, value) {
      const figures = await masterItemRepo.updateCbmPerCase(id, value)
      set((s) => ({
        masterItems: s.masterItems.map((m) => (m.id === id ? { ...m, ...figures } : m)),
      }))
      get().markSaved(`${id}:cbmPerCase`)
    },

    async updateMasterCbmTotal(id, value) {
      const figures = await masterItemRepo.updateCbmTotal(id, value)
      set((s) => ({
        masterItems: s.masterItems.map((m) => (m.id === id ? { ...m, ...figures } : m)),
      }))
      get().markSaved(`${id}:cbmTotal`)
    },
    markSaved(key) {
      set({ recentlySavedKey: key })
      setTimeout(() => {
        // Only clear if no newer save has bumped the key in the meantime.
        if (get().recentlySavedKey === key) set({ recentlySavedKey: null })
      }, 1200)
    },

    /*
      The lifecycle no longer guards itself here, and no longer passes an actor id.

      Both used to live in this store: `if (logisticsStatus !== 'committed') return` was the
      state machine, and `actorId` was the identity written to booked_by. The first was a
      business rule in React that the database knew nothing about — nothing stopped a container
      jumping from committed straight to shipped. The second meant the column recorded what the
      browser claimed rather than who acted.

      Each repo method now maps to one SECURITY DEFINER function that guards its own source
      state and stamps auth.uid() itself. A refused transition throws with the reason, so the
      caller finds out rather than silently no-op'ing — which is what `return` did here.
    */
    async markContainerBooked(id, booking) {
      const updated = await containerRepo.book(id, booking)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    // Revising details without moving the container. booked_at / booked_by are untouched: they
    // record who booked it, and a later correction does not change that fact.
    async updateContainerBooking(id, booking) {
      const updated = await containerRepo.reviseBooking(id, booking)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async unmarkContainerBooked(id) {
      const updated = await containerRepo.unbook(id)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    // Advance from booked, or revise an existing schedule. Which of the two it is is decided by
    // the database from the container's current state, not guessed here — forwarders revise ETD
    // and ETA routinely, and a revision must not overwrite who scheduled it first.
    async setContainerSchedule(id, schedule) {
      const updated = await containerRepo.schedule(id, schedule)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async clearContainerSchedule(id) {
      const updated = await containerRepo.unschedule(id)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async markContainerShipped(id) {
      const updated = await containerRepo.ship(id)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    // The schedule survives — un-shipping says the sailing has not happened, not that the
    // routing was wrong.
    async unmarkContainerShipped(id) {
      const updated = await containerRepo.unship(id)
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },


    acquireLock(resourceId, user) {
      const existing = get().locks[resourceId]
      const now = Date.now()
      const expired = existing && Date.parse(existing.expiresAt) < now
      if (existing && !expired && existing.sessionId !== SESSION_ID) {
        return false
      }
      const lock: LockEntry = {
        resourceId,
        userId: user.id,
        sessionId: SESSION_ID,
        displayName: user.displayName,
        acquiredAt: new Date(now).toISOString(),
        expiresAt: new Date(now + LOCK_TTL_MS).toISOString(),
      }
      set((s) => ({ locks: { ...s.locks, [resourceId]: lock } }))
      presence.send({ type: 'lock-add', lock })
      return true
    },

    releaseLock(resourceId) {
      const existing = get().locks[resourceId]
      if (!existing || existing.sessionId !== SESSION_ID) return
      set((s) => {
        const next = { ...s.locks }
        delete next[resourceId]
        return { locks: next }
      })
      presence.send({
        type: 'lock-remove',
        resourceId,
        sessionId: SESSION_ID,
      })
    },

    refreshLock(resourceId) {
      const existing = get().locks[resourceId]
      if (!existing || existing.sessionId !== SESSION_ID) return
      const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString()
      set((s) => ({
        locks: { ...s.locks, [resourceId]: { ...existing, expiresAt } },
      }))
      presence.send({
        type: 'lock-refresh',
        resourceId,
        sessionId: SESSION_ID,
        expiresAt,
      })
    },

    applyPresenceMessage(msg) {
      switch (msg.type) {
        case 'lock-add': {
          // Same-session messages are echoes of our own acquire; ignore.
          if (msg.lock.sessionId === SESSION_ID) return
          set((s) => ({ locks: { ...s.locks, [msg.lock.resourceId]: msg.lock } }))
          return
        }
        case 'lock-remove': {
          if (msg.sessionId === SESSION_ID) return
          set((s) => {
            const existing = s.locks[msg.resourceId]
            if (!existing || existing.sessionId !== msg.sessionId) return s
            const next = { ...s.locks }
            delete next[msg.resourceId]
            return { locks: next }
          })
          return
        }
        case 'lock-refresh': {
          if (msg.sessionId === SESSION_ID) return
          set((s) => {
            const existing = s.locks[msg.resourceId]
            if (!existing || existing.sessionId !== msg.sessionId) return s
            return {
              locks: {
                ...s.locks,
                [msg.resourceId]: { ...existing, expiresAt: msg.expiresAt },
              },
            }
          })
          return
        }
        case 'snapshot': {
          set((s) => {
            const merged = { ...s.locks }
            for (const lock of msg.locks) {
              if (lock.sessionId === SESSION_ID) continue
              merged[lock.resourceId] = lock
            }
            return { locks: merged }
          })
          return
        }
        case 'snapshot-request': {
          const mine = Object.values(get().locks).filter(
            (l) => l.sessionId === SESSION_ID,
          )
          if (mine.length > 0) {
            presence.send({ type: 'snapshot', locks: mine })
          }
          return
        }
      }
    },

    sweepExpiredLocks() {
      const now = Date.now()
      set((s) => {
        let changed = false
        const next: Record<string, LockEntry> = {}
        for (const [resourceId, lock] of Object.entries(s.locks)) {
          if (Date.parse(lock.expiresAt) < now) {
            changed = true
            continue
          }
          next[resourceId] = lock
        }
        return changed ? { locks: next } : s
      })
    },

    isLockedByOther(resourceId) {
      const lock = get().locks[resourceId]
      if (!lock) return null
      if (lock.sessionId === SESSION_ID) return null
      if (Date.parse(lock.expiresAt) < Date.now()) return null
      return lock
    },

    isLockedByMe(resourceId) {
      const lock = get().locks[resourceId]
      return !!lock && lock.sessionId === SESSION_ID
    },

    heldLocks() {
      return Object.values(get().locks).filter(
        (l) => l.sessionId === SESSION_ID,
      )
    },

    async reconcileCommitted(masterItemIds) {
      /*
        Read the world back before deciding anything. Local state is only what the last mutation
        believed happened; this has to judge against what the database actually holds, or it
        would faithfully re-apply the very drift it exists to remove.
      */
      const [containers, allocations, masterItems] = await Promise.all([
        containerRepo.fetchAll(),
        allocationRepo.fetchAll(),
        masterItemRepo.fetchAll(),
      ])

      const committedContainerIds = new Set(
        containers.filter((c) => c.status === 'committed').map((c) => c.id),
      )

      const truth = new Map<string, number>()
      for (const a of allocations) {
        if (!committedContainerIds.has(a.containerId)) continue
        truth.set(a.masterItemId, (truth.get(a.masterItemId) ?? 0) + a.quantity)
      }

      const scope = masterItemIds?.length ? new Set(masterItemIds) : null
      const wrong = masterItems.filter(
        (m) =>
          (!scope || scope.has(m.id)) &&
          m.committedQuantity !== (truth.get(m.id) ?? 0),
      )

      for (const m of wrong) {
        await masterItemRepo.setCommittedQuantity(m.id, truth.get(m.id) ?? 0)
      }

      // Refetch once at the end rather than patching in place: after a correction, the only
      // trustworthy version of a line is the one the database just accepted.
      set({
        containers,
        allocations,
        masterItems: wrong.length ? await masterItemRepo.fetchAll() : masterItems,
      })
    },

    availableQty(masterItemId) {
      const item = get().masterItems.find((m) => m.id === masterItemId)
      if (!item) return 0
      const draftContainerIds = new Set(
        get()
          .containers.filter((c) => c.status === 'draft')
          .map((c) => c.id),
      )
      const allocatedInDrafts = get()
        .allocations.filter(
          (a) =>
            a.masterItemId === masterItemId && draftContainerIds.has(a.containerId),
        )
        .reduce((sum, a) => sum + a.quantity, 0)
      return item.originalQuantity - item.committedQuantity - allocatedInDrafts
    },

    containerCbm(containerId, excludeAllocationId = null) {
      const masterItems = get().masterItems
      return get()
        .allocations.filter(
          (a) => a.containerId === containerId && a.id !== excludeAllocationId,
        )
        .reduce((sum, a) => {
          const item = masterItems.find((m) => m.id === a.masterItemId)
          return item ? sum + item.cbmPerCase * a.quantity : sum
        }, 0)
    },

    containersHoldingItem(masterItemId) {
      const containerIdsWithItem = new Set(
        get()
          .allocations.filter((a) => a.masterItemId === masterItemId)
          .map((a) => a.containerId),
      )
      return get().containers.filter((c) => containerIdsWithItem.has(c.id))
    },

    eligibleContainersForMasterItem(masterItemId) {
      const item = get().masterItems.find((m) => m.id === masterItemId)
      if (!item) return []
      return get()
        .containers.filter(
          (c) =>
            c.status === 'draft' &&
            c.destination === item.shipTo &&
            c.supplierId === item.supplierId,
        )
        .sort((a, b) => a.displayOrder - b.displayOrder)
    },

    displayNameById(userId) {
      if (!userId) return ''
      const profile = get().profiles.find((p) => p.id === userId)
      return profile?.displayName ?? userId
    },
  }
})
