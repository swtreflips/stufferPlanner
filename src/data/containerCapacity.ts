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
 *
 * THESE ARE FALLBACKS, NOT THE SOURCE OF TRUTH. The live numbers come from
 * `planner_container_capacity` and are installed by `setCapacities()` during
 * store hydration — they are what the loading team can actually achieve with
 * boxed product, which is learned by doing it repeatedly, not decided once.
 *
 * They stay here, and stay equal to the seeded row values, because every
 * function below is SYNCHRONOUS and read from thirteen call sites including the
 * store's allocation guards. A read before hydration finishes must return
 * something sane; returning zero or undefined would briefly let the ceiling
 * guard pass anything through, which is a worse failure than being 3 m³ out of
 * date for one render.
 */
const CONTAINER_CAPACITY: Record<ContainerType, ContainerCapacity | null> = {
  '20GP': { maxCbm: 33, defaultOperationalCbm: 29 },
  '40GP': { maxCbm: 67, defaultOperationalCbm: 57 },
  '40HC': { maxCbm: 76, defaultOperationalCbm: 65 },
}

/**
 * Install the capacities loaded from the database.
 *
 * Mutating a module-level record rather than threading capacity through every
 * caller is deliberate. This is configuration: one writer, at hydration, read
 * everywhere. Passing it explicitly would mean changing the signature of the
 * store's pure guards and every component that draws a fill bar, to gain
 * type-safety over a value that has exactly one source and never changes
 * mid-session.
 *
 * Types absent from `rows` keep their fallback — a database missing a row must
 * not silently remove a container type's ceiling.
 */
export function setCapacities(rows: Partial<Record<ContainerType, ContainerCapacity>>): void {
  for (const [type, capacity] of Object.entries(rows) as [ContainerType, ContainerCapacity][]) {
    if (capacity) CONTAINER_CAPACITY[type] = capacity
  }
}

/** Every configured type, for the settings panel. */
export function allCapacities(): { type: ContainerType; capacity: ContainerCapacity }[] {
  return (Object.entries(CONTAINER_CAPACITY) as [ContainerType, ContainerCapacity | null][])
    .filter((entry): entry is [ContainerType, ContainerCapacity] => entry[1] !== null)
    .map(([type, capacity]) => ({ type, capacity }))
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
