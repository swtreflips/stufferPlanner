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
      const displayOrder = containers.length
      const container: Container = {
        id: `container-${nextId++}`,
        status: 'draft',
        scenarioId: input.scenarioId,
        name: input.name,
        type: input.type,
        destination: input.destination,
        displayOrder,
        ofqReference: null,
        committedAt: null,
        committedBy: null,
        createdBy: input.createdBy,
        createdAt: now,
      }
      containers = [...containers, container]
      return { ...container }
    },
    async delete(id) {
      containers = containers.filter((c) => c.id !== id)
    },
  }
}
