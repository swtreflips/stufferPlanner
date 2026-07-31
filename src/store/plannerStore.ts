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

  // Monotonic per-supplier sequence (supplier code → next number).
  // Never decremented on delete; ensures container codes are stable references.
  containerCodeSequences: Record<string, number>

  // Live editing presence
  locks: Record<string, LockEntry>
  mySessionId: string

  // Data loading. `hydrate` must be called by a component INSIDE the auth gate — see the
  // note on the store creator. `loadError` surfaces a failed fetch, which otherwise looks
  // exactly like an empty board.
  hydrated: boolean
  loadError: string | null
  hydrate(): Promise<void>

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
  moveAllocation(allocationId: string, newContainerId: string): Promise<void>

  // Factory-owned master-data edits. Inline grid + CSV upload both route here.
  updateMasterCargoReady(id: string, isoDate: string): Promise<void>
  updateMasterCbmPerCase(id: string, value: number): Promise<void>
  markSaved(key: string): void

  commitContainer(id: string, ofqReference: string, committedBy: string): Promise<void>
  uncommitContainer(id: string): Promise<void>

  // Post-commit lifecycle. Each action enforces the source status itself; the
  // dialog wires them to its buttons. *By stamps come from the caller (the
  // current useAuth profile id); Phase 12 swaps to auth.uid() server-side.
  markContainerBooked(id: string, booking: ContainerBooking, actorId: string): Promise<void>
  updateContainerBooking(id: string, booking: ContainerBooking): Promise<void>
  unmarkContainerBooked(id: string): Promise<void>
  setContainerSchedule(
    id: string,
    schedule: ContainerSchedule,
    actorId: string,
  ): Promise<void>
  clearContainerSchedule(id: string): Promise<void>
  markContainerShipped(id: string, actorId: string): Promise<void>
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

    async hydrate() {
      // Every repo is fetched together and applied together. A partial board — PO lines
      // without the suppliers they belong to — renders blank supplier names that read as
      // missing data rather than a failed load.
      try {
        const [masterItems, containers, allocations, suppliers, profiles, myOrgIds] =
          await Promise.all([
            masterItemRepo.fetchAll(),
            containerRepo.fetchAll(),
            allocationRepo.fetchAll(),
            supplierRepo.fetchAll(),
            profileRepo.fetchAll(),
            profileRepo.fetchMyOrgIds(),
          ])
        // supplierFilterId resets on every hydrate. It is keyed to a user, and hydrate reruns
        // when the user changes — carrying a previous account's focus across a sign-in would
        // silently narrow the board to an organization the new person may not even belong to.
        set({
          masterItems, containers, allocations, suppliers, profiles, myOrgIds,
          supplierFilterId: null, hydrated: true, loadError: null,
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
    containerCodeSequences: {},
    locks: {},
    mySessionId: SESSION_ID,

    async createContainer({ name, type, destination, supplierId }) {
      const supplier = get().suppliers.find((s) => s.id === supplierId)
      if (!supplier) throw new Error(`createContainer: unknown supplier ${supplierId}`)
      const prefix = supplier.code.toUpperCase()
      const next = (get().containerCodeSequences[prefix] ?? 0) + 1
      const code = `${prefix}${String(next).padStart(4, '0')}`
      const capacityCbm = getCapacityConfig(type)?.defaultOperationalCbm ?? null
      const container = await containerRepo.create({
        code,
        name,
        type,
        destination,
        supplierId,
        capacityCbm,
      })
      set((s) => ({
        containers: [...s.containers, container],
        containerCodeSequences: { ...s.containerCodeSequences, [prefix]: next },
      }))
    },

    async deleteContainer(id) {
      await allocationRepo.deleteByContainerId(id)
      await containerRepo.delete(id)
      set((s) => ({
        containers: s.containers.filter((c) => c.id !== id),
        allocations: s.allocations.filter((a) => a.containerId !== id),
      }))
    },

    async emptyContainer(containerId) {
      await allocationRepo.deleteByContainerId(containerId)
      set((s) => ({
        allocations: s.allocations.filter((a) => a.containerId !== containerId),
      }))
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

    async commitContainer(id, ofqReference, committedBy) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.status !== 'draft') return
      const containerAllocations = get().allocations.filter(
        (a) => a.containerId === id,
      )
      if (containerAllocations.length === 0) return

      const committed = await containerRepo.commit(id, ofqReference, committedBy)

      // Update master committedQuantity (in-memory + repo).
      const deltas: Record<string, number> = {}
      for (const a of containerAllocations) {
        deltas[a.masterItemId] = (deltas[a.masterItemId] ?? 0) + a.quantity
      }
      for (const [itemId, delta] of Object.entries(deltas)) {
        await masterItemRepo.commitQuantity(itemId, delta)
      }

      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? committed : c)),
        masterItems: s.masterItems.map((m) =>
          deltas[m.id]
            ? { ...m, committedQuantity: m.committedQuantity + deltas[m.id] }
            : m,
        ),
      }))
    },

    async uncommitContainer(id) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.status !== 'committed') return
      // Uncommit only from the 'committed' stage — once a container is booked,
      // scheduled, or shipped, the operational state has to be rolled back
      // explicitly via the Logistics dialog first. Keeps the app in sync with
      // reality (you can't un-book a real booking with a button click).
      if (container.logisticsStatus && container.logisticsStatus !== 'committed') return
      const containerAllocations = get().allocations.filter(
        (a) => a.containerId === id,
      )

      const reverted = await containerRepo.uncommit(id)

      const deltas: Record<string, number> = {}
      for (const a of containerAllocations) {
        deltas[a.masterItemId] = (deltas[a.masterItemId] ?? 0) + a.quantity
      }
      for (const [itemId, delta] of Object.entries(deltas)) {
        await masterItemRepo.commitQuantity(itemId, -delta)
      }

      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? reverted : c)),
        masterItems: s.masterItems.map((m) =>
          deltas[m.id]
            ? { ...m, committedQuantity: m.committedQuantity - deltas[m.id] }
            : m,
        ),
      }))
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
    async updateMasterCbmPerCase(id, value) {
      await masterItemRepo.updateCbmPerCase(id, value)
      set((s) => ({
        masterItems: s.masterItems.map((m) =>
          m.id === id ? { ...m, cbmPerCase: value } : m,
        ),
      }))
      get().markSaved(`${id}:cbmPerCase`)
    },
    markSaved(key) {
      set({ recentlySavedKey: key })
      setTimeout(() => {
        // Only clear if no newer save has bumped the key in the meantime.
        if (get().recentlySavedKey === key) set({ recentlySavedKey: null })
      }, 1200)
    },

    async markContainerBooked(id, booking, actorId) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.logisticsStatus !== 'committed') return
      const updated = await containerRepo.updateLogistics(id, {
        logisticsStatus: 'booked',
        booking,
        bookedAt: new Date().toISOString(),
        bookedBy: actorId,
      })
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async updateContainerBooking(id, booking) {
      const container = get().containers.find((c) => c.id === id)
      if (!container) return
      // Revise booking details without changing status or stamps. Allowed once
      // the container carries a booking (booked or later); a no-op on a draft or
      // freshly-committed container that hasn't been booked yet.
      if (!container.logisticsStatus || container.logisticsStatus === 'committed') return
      const updated = await containerRepo.updateLogistics(id, { booking })
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async unmarkContainerBooked(id) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.logisticsStatus !== 'booked') return
      const updated = await containerRepo.updateLogistics(id, {
        logisticsStatus: 'committed',
        booking: null,
        bookedAt: null,
        bookedBy: null,
      })
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async setContainerSchedule(id, schedule, actorId) {
      const container = get().containers.find((c) => c.id === id)
      if (!container) return
      // Allow from booked (advance to scheduled), or while already scheduled /
      // shipped (revision — forwarders revise ETD/ETA). On the advance path we
      // stamp scheduledAt/By; revisions leave those alone (first scheduler).
      if (container.logisticsStatus === 'committed' || container.logisticsStatus === null) return
      const advancing = container.logisticsStatus === 'booked'
      const updated = await containerRepo.updateLogistics(id, {
        schedule,
        ...(advancing
          ? {
              logisticsStatus: 'scheduled' as const,
              scheduledAt: new Date().toISOString(),
              scheduledBy: actorId,
            }
          : {}),
      })
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async clearContainerSchedule(id) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.logisticsStatus !== 'scheduled') return
      const updated = await containerRepo.updateLogistics(id, {
        logisticsStatus: 'booked',
        schedule: null,
        scheduledAt: null,
        scheduledBy: null,
      })
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async markContainerShipped(id, actorId) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.logisticsStatus !== 'scheduled') return
      const updated = await containerRepo.updateLogistics(id, {
        logisticsStatus: 'shipped',
        shippedAt: new Date().toISOString(),
        shippedBy: actorId,
      })
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async unmarkContainerShipped(id) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.logisticsStatus !== 'shipped') return
      const updated = await containerRepo.updateLogistics(id, {
        logisticsStatus: 'scheduled',
        shippedAt: null,
        shippedBy: null,
      })
      set((s) => ({
        containers: s.containers.map((c) => (c.id === id ? updated : c)),
      }))
    },

    async moveAllocation(allocationId, newContainerId) {
      const allocation = get().allocations.find((a) => a.id === allocationId)
      if (!allocation) return
      if (allocation.containerId === newContainerId) return
      const target = get().containers.find((c) => c.id === newContainerId)
      if (!target || target.status !== 'draft') return
      const item = get().masterItems.find((m) => m.id === allocation.masterItemId)
      if (!item) return
      if (item.shipTo !== target.destination) return
      if (item.supplierId !== target.supplierId) return

      // Block moves that would push the target past its structural ceiling. The
      // moved allocation is not yet in the target, so containerCbm(target)
      // already accounts for any same-item allocation it will merge into.
      const projected =
        get().containerCbm(newContainerId) + item.cbmPerCase * allocation.quantity
      if (exceedsCeiling(target.type, projected)) return

      // Merge into an existing allocation in the target container if one exists
      // for the same master item.
      const existing = get().allocations.find(
        (a) =>
          a.id !== allocationId &&
          a.containerId === newContainerId &&
          a.masterItemId === allocation.masterItemId,
      )
      if (existing) {
        const mergedQuantity = existing.quantity + allocation.quantity
        await allocationRepo.update(existing.id, mergedQuantity)
        await allocationRepo.delete(allocationId)
        set((s) => ({
          allocations: s.allocations
            .filter((a) => a.id !== allocationId)
            .map((a) =>
              a.id === existing.id ? { ...a, quantity: mergedQuantity } : a,
            ),
        }))
        return
      }

      await allocationRepo.updateContainerId(allocationId, newContainerId)
      set((s) => ({
        allocations: s.allocations.map((a) =>
          a.id === allocationId ? { ...a, containerId: newContainerId } : a,
        ),
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
