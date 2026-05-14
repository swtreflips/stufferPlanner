import { createLocalContainerRepo } from './LocalContainerRepo'
import { createLocalShipmentRepo } from './LocalShipmentRepo'
import type { ContainerRepo, ShipmentRepo } from './types'

const dataSource = import.meta.env.VITE_DATA_SOURCE ?? 'local'

function pickShipmentRepo(): ShipmentRepo {
  switch (dataSource) {
    case 'local':
      return createLocalShipmentRepo()
    default:
      console.warn(
        `[repos] Unknown VITE_DATA_SOURCE "${dataSource}". Falling back to local.`,
      )
      return createLocalShipmentRepo()
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

export const shipmentRepo = pickShipmentRepo()
export const containerRepo = pickContainerRepo()

export type { ContainerRepo, ShipmentRepo }
