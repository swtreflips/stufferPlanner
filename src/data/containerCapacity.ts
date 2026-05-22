import type { ContainerType } from '../types/container'

/**
 * CBM capacity for a container type.
 *
 * `maxCbm` is the structural ceiling — the hard upper bound a per-container
 * operational cap can ever be raised to. `defaultOperationalCbm` is the cap
 * applied to a new container at creation: lower than the structural max because
 * box dimensions prevent perfect packing, so some volume is always left empty.
 */
export interface ContainerCapacity {
  maxCbm: number
  defaultOperationalCbm: number
}

/**
 * Per-type CBM capacity. Every container type is configured today. The value
 * stays nullable so a future type can be introduced without a configured
 * capacity — it would render no fill bar until numbers are added here.
 */
export const CONTAINER_CAPACITY: Record<ContainerType, ContainerCapacity | null> = {
  '20GP': { maxCbm: 33, defaultOperationalCbm: 29 },
  '40GP': { maxCbm: 67, defaultOperationalCbm: 57 },
  '40HC': { maxCbm: 76, defaultOperationalCbm: 65 },
}

/** Capacity config for a type, or `null` if the type has no numbers yet. */
export function getCapacityConfig(type: ContainerType): ContainerCapacity | null {
  return CONTAINER_CAPACITY[type]
}

/**
 * Bound an edited operational cap to `[1, maxCbm]` for the given type. Falls
 * back to the raw value when the type has no configured capacity (it has no
 * structural max to clamp against).
 */
export function clampCapacity(type: ContainerType, value: number): number {
  const config = CONTAINER_CAPACITY[type]
  if (!config) return value
  return Math.min(Math.max(value, 1), config.maxCbm)
}
