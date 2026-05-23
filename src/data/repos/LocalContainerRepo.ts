import type { Container } from '../../types/container'
import type {
  ContainerRepo,
  CreateContainerInput,
  LogisticsPatch,
} from './types'

let nextId = 1

export function createLocalContainerRepo(): ContainerRepo {
  let containers: Container[] = []

  return {
    async fetchAll() {
      return containers.map((c) => ({ ...c }))
    },
    async create(input: CreateContainerInput): Promise<Container> {
      const now = new Date().toISOString()
      const displayOrder = input.displayOrder ?? containers.length
      const container: Container = {
        id: `container-${nextId++}`,
        code: input.code,
        status: 'draft',
        name: input.name,
        type: input.type,
        destination: input.destination,
        supplierId: input.supplierId,
        capacityCbm: input.capacityCbm,
        displayOrder,
        ofqReference: null,
        committedAt: null,
        committedBy: null,
        createdAt: now,
        logisticsStatus: null,
        bookedAt: null,
        bookedBy: null,
        schedule: null,
        scheduledAt: null,
        scheduledBy: null,
        shippedAt: null,
        shippedBy: null,
      }
      containers = [...containers, container]
      return { ...container }
    },
    async delete(id) {
      containers = containers.filter((c) => c.id !== id)
    },
    async updateCapacity(id, capacityCbm): Promise<Container> {
      const idx = containers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error(`updateCapacity: container ${id} not found`)
      const updated: Container = { ...containers[idx], capacityCbm }
      containers = [
        ...containers.slice(0, idx),
        updated,
        ...containers.slice(idx + 1),
      ]
      return { ...updated }
    },
    async commit(id, ofqReference, committedBy): Promise<Container> {
      const idx = containers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error(`commit: container ${id} not found`)
      const updated: Container = {
        ...containers[idx],
        status: 'committed',
        ofqReference,
        committedAt: new Date().toISOString(),
        committedBy,
        logisticsStatus: 'committed',
      }
      containers = [
        ...containers.slice(0, idx),
        updated,
        ...containers.slice(idx + 1),
      ]
      return { ...updated }
    },
    async uncommit(id): Promise<Container> {
      const idx = containers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error(`uncommit: container ${id} not found`)
      const updated: Container = {
        ...containers[idx],
        status: 'draft',
        ofqReference: null,
        committedAt: null,
        committedBy: null,
        logisticsStatus: null,
        bookedAt: null,
        bookedBy: null,
        schedule: null,
        scheduledAt: null,
        scheduledBy: null,
        shippedAt: null,
        shippedBy: null,
      }
      containers = [
        ...containers.slice(0, idx),
        updated,
        ...containers.slice(idx + 1),
      ]
      return { ...updated }
    },
    async updateLogistics(id, patch: LogisticsPatch): Promise<Container> {
      const idx = containers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error(`updateLogistics: container ${id} not found`)
      const updated: Container = { ...containers[idx], ...patch }
      containers = [
        ...containers.slice(0, idx),
        updated,
        ...containers.slice(idx + 1),
      ]
      return { ...updated }
    },
  }
}
