import type { ContainerType } from '../types/container'

/**
 * Thrown by store mutations that would push a container's total CBM past its
 * structural ceiling. The UI prevents reaching this in normal use; it is a
 * last-resort invariant guard the allocation dialog catches.
 */
export class CbmCeilingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CbmCeilingError'
  }
}

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

/**
 * Floating-point slack for CBM comparisons. `cbmPerCase × quantity` sums drift
 * by tiny amounts, so an exact `>` would flag a container that is dead-on the
 * ceiling as over it.
 */
const CBM_EPSILON = 1e-6

/**
 * Whether a projected total CBM breaches the type's structural ceiling — the
 * hard limit a container can never exceed. Returns `false` for an unconfigured
 * type (it has no ceiling to breach).
 */
export function exceedsCeiling(type: ContainerType, projectedCbm: number): boolean {
  const config = CONTAINER_CAPACITY[type]
  if (!config) return false
  return projectedCbm > config.maxCbm + CBM_EPSILON
}

/**
 * The largest number of cases of a given `cbmPerCase` that still fits under the
 * structural ceiling, given the CBM already committed to the container by other
 * allocations (`otherCbm`). Returns `Infinity` when the type has no ceiling or
 * the item contributes no CBM (only availability binds in those cases).
 */
export function maxCasesWithinCeiling(
  type: ContainerType,
  otherCbm: number,
  cbmPerCase: number,
): number {
  const config = CONTAINER_CAPACITY[type]
  if (!config || cbmPerCase <= 0) return Infinity
  const headroom = config.maxCbm - otherCbm
  return Math.max(0, Math.floor((headroom + CBM_EPSILON) / cbmPerCase))
}
