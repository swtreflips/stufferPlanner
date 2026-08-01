import { createLocalAllocationRepo } from './LocalAllocationRepo'
import { createLocalContainerRepo } from './LocalContainerRepo'
import { createLocalMasterItemRepo } from './LocalMasterItemRepo'
import { createLocalProfileRepo } from './LocalProfileRepo'
import { createLocalSupplierRepo } from './LocalSupplierRepo'
import { createSupabaseAllocationRepo } from './SupabaseAllocationRepo'
import { createSupabaseContainerRepo } from './SupabaseContainerRepo'
import { createSupabaseMasterItemRepo } from './SupabaseMasterItemRepo'
import { createSupabaseProfileRepo } from './SupabaseProfileRepo'
import { createSupabaseSupplierRepo } from './SupabaseSupplierRepo'
import type {
  AllocationRepo,
  ContainerRepo,
  MasterItemRepo,
  ProfileRepo,
  SupplierRepo,
} from './types'

const dataSource = import.meta.env.VITE_DATA_SOURCE ?? 'local'

// Each picker is INDEPENDENT on purpose: a repo can be migrated and verified on its own rather
// than flipping five at once and debugging auth, RLS and column mapping simultaneously.
//
// All five now resolve to Supabase. Containers and allocations were the last, and they were the
// ones that mattered most — until they landed, a draft container and everything allocated into
// it lived in a JavaScript object in one browser tab. It looked saved and was not.

function pickMasterItemRepo(): MasterItemRepo {
  switch (dataSource) {
    case 'local':
      return createLocalMasterItemRepo()
    case 'supabase':
      return createSupabaseMasterItemRepo()
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
    case 'supabase':
      return createSupabaseContainerRepo()
    default:
      return createLocalContainerRepo()
  }
}

function pickAllocationRepo(): AllocationRepo {
  switch (dataSource) {
    case 'local':
      return createLocalAllocationRepo()
    case 'supabase':
      return createSupabaseAllocationRepo()
    default:
      return createLocalAllocationRepo()
  }
}

function pickSupplierRepo(): SupplierRepo {
  switch (dataSource) {
    case 'local':
      return createLocalSupplierRepo()
    case 'supabase':
      return createSupabaseSupplierRepo()
    default:
      return createLocalSupplierRepo()
  }
}

function pickProfileRepo(): ProfileRepo {
  switch (dataSource) {
    case 'local':
      return createLocalProfileRepo()
    case 'supabase':
      return createSupabaseProfileRepo()
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
