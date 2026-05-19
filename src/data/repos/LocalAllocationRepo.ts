import type { Allocation } from '../../types/allocation'
import type { AllocationRepo, CreateAllocationInput } from './types'

let nextId = 1

export function createLocalAllocationRepo(): AllocationRepo {
  let allocations: Allocation[] = []

  return {
    async fetchAll() {
      return allocations.map((a) => ({ ...a }))
    },
    async create(input: CreateAllocationInput): Promise<Allocation> {
      const orderInContainer = allocations.filter(
        (a) => a.containerId === input.containerId,
      ).length
      const allocation: Allocation = {
        id: `allocation-${nextId++}`,
        containerId: input.containerId,
        masterItemId: input.masterItemId,
        quantity: input.quantity,
        displayOrder: input.displayOrder ?? orderInContainer,
        createdAt: new Date().toISOString(),
      }
      allocations = [...allocations, allocation]
      return { ...allocation }
    },
    async update(id, quantity) {
      allocations = allocations.map((a) =>
        a.id === id ? { ...a, quantity } : a,
      )
    },
    async updateContainerId(id, newContainerId) {
      allocations = allocations.map((a) =>
        a.id === id ? { ...a, containerId: newContainerId } : a,
      )
    },
    async delete(id) {
      allocations = allocations.filter((a) => a.id !== id)
    },
    async deleteByContainerId(containerId) {
      allocations = allocations.filter((a) => a.containerId !== containerId)
    },
  }
}
