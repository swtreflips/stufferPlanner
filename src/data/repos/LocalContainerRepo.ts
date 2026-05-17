import type { Container } from '../../types/container'
import type { ContainerRepo, CreateContainerInput } from './types'

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
        status: 'draft',
        name: input.name,
        type: input.type,
        destination: input.destination,
        displayOrder,
        ofqReference: null,
        committedAt: null,
        createdAt: now,
      }
      containers = [...containers, container]
      return { ...container }
    },
    async delete(id) {
      containers = containers.filter((c) => c.id !== id)
    },
    async commit(id, ofqReference): Promise<Container> {
      const idx = containers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error(`commit: container ${id} not found`)
      const updated: Container = {
        ...containers[idx],
        status: 'committed',
        ofqReference,
        committedAt: new Date().toISOString(),
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
      }
      containers = [
        ...containers.slice(0, idx),
        updated,
        ...containers.slice(idx + 1),
      ]
      return { ...updated }
    },
  }
}
