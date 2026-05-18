import { createLocalAllocationRepo } from './LocalAllocationRepo'
import { createLocalContainerRepo } from './LocalContainerRepo'
import { createLocalMasterItemRepo } from './LocalMasterItemRepo'
import { createLocalProfileRepo } from './LocalProfileRepo'
import { createLocalSupplierRepo } from './LocalSupplierRepo'
import type {
  AllocationRepo,
  ContainerRepo,
  MasterItemRepo,
  ProfileRepo,
  SupplierRepo,
} from './types'

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

function pickSupplierRepo(): SupplierRepo {
  switch (dataSource) {
    case 'local':
      return createLocalSupplierRepo()
    default:
      return createLocalSupplierRepo()
  }
}

function pickProfileRepo(): ProfileRepo {
  switch (dataSource) {
    case 'local':
      return createLocalProfileRepo()
    default:
      return createLocalProfileRepo()
  }
}

export const masterItemRepo = pickMasterItemRepo()
export const containerRepo = pickContainerRepo()
export const allocationRepo = pickAllocationRepo()
export const supplierRepo = pickSupplierRepo()
export const profileRepo = pickProfileRepo()

export type {
  AllocationRepo,
  ContainerRepo,
  CreateAllocationInput,
  CreateContainerInput,
  MasterItemRepo,
  ProfileRepo,
  SupplierRepo,
} from './types'
