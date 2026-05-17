import { create } from 'zustand'
import type { MasterItem } from '../types/masterItem'
import type { Container, ContainerType } from '../types/container'
import type { Allocation, AllocationDialogMode } from '../types/allocation'
import { allocationRepo, containerRepo, masterItemRepo } from '../data/repos'

interface CreateContainerArgs {
  name: string
  type: ContainerType
  destination: string
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

interface PlannerStore {
  masterItems: MasterItem[]
  containers: Container[]
  allocations: Allocation[]
  allocationDialog: AllocationDialogState
  commitDialog: CommitDialogState

  createContainer(args: CreateContainerArgs): Promise<void>
  deleteContainer(id: string): Promise<void>
  emptyContainer(id: string): Promise<void>

  addAllocation(input: AddAllocationArgs): Promise<Allocation>
  updateAllocation(id: string, quantity: number): Promise<void>
  removeAllocation(id: string): Promise<void>

  commitContainer(id: string, ofqReference: string): Promise<void>
  uncommitContainer(id: string): Promise<void>

  openAllocationDialog(mode: AllocationDialogMode): void
  closeAllocationDialog(): void
  openCommitDialog(containerId: string): void
  closeCommitDialog(): void

  availableQty(masterItemId: string): number
  containersHoldingItem(masterItemId: string): Container[]
}

export const usePlannerStore = create<PlannerStore>((set, get) => {
  masterItemRepo.fetchAll().then((masterItems) => set({ masterItems }))
  containerRepo.fetchAll().then((containers) => set({ containers }))
  allocationRepo.fetchAll().then((allocations) => set({ allocations }))

  return {
    masterItems: [],
    containers: [],
    allocations: [],
    allocationDialog: { open: false, mode: null },
    commitDialog: { open: false, containerId: null },

    async createContainer({ name, type, destination }) {
      const container = await containerRepo.create({ name, type, destination })
      set((s) => ({ containers: [...s.containers, container] }))
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

    async addAllocation({ containerId, masterItemId, quantity }) {
      const existing = get().allocations.find(
        (a) => a.containerId === containerId && a.masterItemId === masterItemId,
      )
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

    async commitContainer(id, ofqReference) {
      const container = get().containers.find((c) => c.id === id)
      if (!container || container.status !== 'draft') return
      const containerAllocations = get().allocations.filter(
        (a) => a.containerId === id,
      )
      if (containerAllocations.length === 0) return

      const committed = await containerRepo.commit(id, ofqReference)

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

    containersHoldingItem(masterItemId) {
      const containerIdsWithItem = new Set(
        get()
          .allocations.filter((a) => a.masterItemId === masterItemId)
          .map((a) => a.containerId),
      )
      return get().containers.filter((c) => containerIdsWithItem.has(c.id))
    },
  }
})
