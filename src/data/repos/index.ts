import { createLocalContainerRepo } from './LocalContainerRepo'
import { createLocalOpenPoRepo } from './LocalOpenPoRepo'
import type { ContainerRepo, OpenPoRepo } from './types'

const dataSource = import.meta.env.VITE_DATA_SOURCE ?? 'local'

function pickOpenPoRepo(): OpenPoRepo {
  switch (dataSource) {
    case 'local':
      return createLocalOpenPoRepo()
    default:
      console.warn(
        `[repos] Unknown VITE_DATA_SOURCE "${dataSource}". Falling back to local.`,
      )
      return createLocalOpenPoRepo()
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

export const openPoRepo = pickOpenPoRepo()
export const containerRepo = pickContainerRepo()

export type { ContainerRepo, OpenPoRepo }
