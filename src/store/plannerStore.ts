import { create } from 'zustand'
import type { MasterItem } from '../types/masterItem'
import type { Container, ContainerType } from '../types/container'
import type { Scenario } from '../types/scenario'
import type { Allocation, AllocationDialogMode } from '../types/allocation'
import {
  allocationRepo,
  containerRepo,
  masterItemRepo,
  scenarioRepo,
} from '../data/repos'

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

interface ForkResult {
  newScenarioId: string
  containerIdMap: Record<string, string>
}

interface AllocationDialogState {
  open: boolean
  mode: AllocationDialogMode | null
}

interface PlannerStore {
  masterItems: MasterItem[]
  scenarios: Scenario[]
  containers: Container[]
  allocations: Allocation[]
  currentScenarioId: string | null
  allocationDialog: AllocationDialogState

  createContainer(args: CreateContainerArgs): Promise<void>
  deleteContainer(id: string): Promise<void>

  setCurrentScenario(id: string): void
  addAllocation(input: AddAllocationArgs): Promise<Allocation>
  updateAllocation(id: string, quantity: number): Promise<void>
  removeAllocation(id: string): Promise<void>
  emptyContainer(containerId: string): Promise<void>
  forkScenario(name: string, sourceScenarioId?: string): Promise<ForkResult>
  tryAlternativeForContainer(
    containerId: string,
    newScenarioName: string,
  ): Promise<string>

  openAllocationDialog(mode: AllocationDialogMode): void
  closeAllocationDialog(): void

  availableQty(scenarioId: string | null, masterItemId: string): number
  containersHoldingItem(scenarioId: string | null, masterItemId: string): Container[]
}

const CURRENT_USER = 'Mike'

export const usePlannerStore = create<PlannerStore>((set, get) => {
  masterItemRepo.fetchAll().then((masterItems) => set({ masterItems }))
  scenarioRepo.fetchAll().then((scenarios) => {
    const main = scenarios.find((s) => s.name === 'Main') ?? scenarios[0] ?? null
    set({ scenarios, currentScenarioId: main?.id ?? null })
  })
  containerRepo.fetchAll().then((containers) => set({ containers }))
  allocationRepo.fetchAll().then((allocations) => set({ allocations }))

  return {
    masterItems: [],
    scenarios: [],
    containers: [],
    allocations: [],
    currentScenarioId: null,
    allocationDialog: { open: false, mode: null },

    async createContainer({ name, type, destination }) {
      const scenarioId = get().currentScenarioId
      if (!scenarioId) return
      const container = await containerRepo.create({
        name,
        type,
        destination,
        scenarioId,
        createdBy: CURRENT_USER,
      })
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

    setCurrentScenario(id) {
      set({ currentScenarioId: id })
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
        createdBy: CURRENT_USER,
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

    async emptyContainer(containerId) {
      await allocationRepo.deleteByContainerId(containerId)
      set((s) => ({
        allocations: s.allocations.filter((a) => a.containerId !== containerId),
      }))
    },

    async forkScenario(name, sourceScenarioId) {
      const sourceId = sourceScenarioId ?? get().currentScenarioId
      if (!sourceId) {
        throw new Error('forkScenario: no source scenario')
      }
      const newScenario = await scenarioRepo.create({
        name,
        parentId: sourceId,
        createdBy: CURRENT_USER,
      })

      const sourceContainers = get().containers.filter(
        (c) => c.scenarioId === sourceId,
      )
      const containerIdMap: Record<string, string> = {}
      const clonedContainers: Container[] = []
      for (const source of sourceContainers) {
        const cloned = await containerRepo.create({
          name: source.name,
          type: source.type,
          destination: source.destination,
          scenarioId: newScenario.id,
          createdBy: CURRENT_USER,
          displayOrder: source.displayOrder,
        })
        containerIdMap[source.id] = cloned.id
        clonedContainers.push(cloned)
      }

      const sourceAllocations = get().allocations.filter(
        (a) => containerIdMap[a.containerId] !== undefined,
      )
      const clonedAllocations: Allocation[] = []
      for (const source of sourceAllocations) {
        const cloned = await allocationRepo.create({
          containerId: containerIdMap[source.containerId],
          masterItemId: source.masterItemId,
          quantity: source.quantity,
          createdBy: CURRENT_USER,
          displayOrder: source.displayOrder,
        })
        clonedAllocations.push(cloned)
      }

      set((s) => ({
        scenarios: [...s.scenarios, newScenario],
        containers: [...s.containers, ...clonedContainers],
        allocations: [...s.allocations, ...clonedAllocations],
      }))

      return { newScenarioId: newScenario.id, containerIdMap }
    },

    async tryAlternativeForContainer(containerId, newScenarioName) {
      const { newScenarioId, containerIdMap } =
        await get().forkScenario(newScenarioName)
      const newContainerId = containerIdMap[containerId]
      if (newContainerId) {
        await get().emptyContainer(newContainerId)
      }
      get().setCurrentScenario(newScenarioId)
      return newScenarioId
    },

    openAllocationDialog(mode) {
      set({ allocationDialog: { open: true, mode } })
    },

    closeAllocationDialog() {
      set({ allocationDialog: { open: false, mode: null } })
    },

    availableQty(scenarioId, masterItemId) {
      if (!scenarioId) return 0
      const item = get().masterItems.find((m) => m.id === masterItemId)
      if (!item) return 0
      const containerIdsInScenario = new Set(
        get()
          .containers.filter((c) => c.scenarioId === scenarioId)
          .map((c) => c.id),
      )
      const allocatedInScenario = get()
        .allocations.filter(
          (a) =>
            a.masterItemId === masterItemId &&
            containerIdsInScenario.has(a.containerId),
        )
        .reduce((sum, a) => sum + a.quantity, 0)
      return item.originalQuantity - item.committedQuantity - allocatedInScenario
    },

    containersHoldingItem(scenarioId, masterItemId) {
      if (!scenarioId) return []
      const scenarioContainerIds = new Set(
        get()
          .containers.filter((c) => c.scenarioId === scenarioId)
          .map((c) => c.id),
      )
      const containerIdsWithItem = new Set(
        get()
          .allocations.filter(
            (a) =>
              a.masterItemId === masterItemId &&
              scenarioContainerIds.has(a.containerId),
          )
          .map((a) => a.containerId),
      )
      return get().containers.filter((c) => containerIdsWithItem.has(c.id))
    },
  }
})
