import type { Container } from '../../types/container'
import type { ContainerRepo } from './types'

export function createLocalContainerRepo(): ContainerRepo {
  const containers: Container[] = []

  return {
    async fetchAll() {
      return containers.map((c) => ({ ...c }))
    },
  }
}
