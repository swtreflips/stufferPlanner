import { createLocalAllocationRepo } from './LocalAllocationRepo'
import { createLocalContainerRepo } from './LocalContainerRepo'
import { createLocalMasterItemRepo } from './LocalMasterItemRepo'
import type { AllocationRepo, ContainerRepo, MasterItemRepo } from './types'

const dataSource = import.meta.env.VITE_DATA_SOURCE ?? 'local'

function pickMasterItemRepo(): MasterItemRepo {
  switch (dataSource) {
    case 'local':
      return createLocalMasterItemRepo()
    default:
      console.warn(
        `[repos] Unknown VITE_DATA_SOURCE "${dataSource}". Falling back to local.`,
      )
      return createLocalMasterItemRepo()
  }
}

function pickContainerRepo(): ContainerRepo {
  switch (dataSource) {
    case 'local':
      return createLocalContainerRepo()
    default:
      return createLocalContainerRepo()
  }
}

function pickAllocationRepo(): AllocationRepo {
  switch (dataSource) {
    case 'local':
      return createLocalAllocationRepo()
    default:
      return createLocalAllocationRepo()
  }
}

export const masterItemRepo = pickMasterItemRepo()
export const containerRepo = pickContainerRepo()
export const allocationRepo = pickAllocationRepo()

export type {
  AllocationRepo,
  ContainerRepo,
  CreateAllocationInput,
  CreateContainerInput,
  MasterItemRepo,
} from './types'
