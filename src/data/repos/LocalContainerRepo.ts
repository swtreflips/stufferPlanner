import type { Container } from '../../types/container'
import type {
  ContainerRepo,
  CreateContainerInput,
} from './types'

let nextId = 1

// Sample data has no session. Nothing reads these stamps in local mode; the field exists so the
// shape matches what Supabase returns.
const LOCAL_ACTOR = 'local-user'

/* Derived from the containers already held rather than from a counter, for the same reason the
   Supabase side asks the database: a counter that does not know what already exists re-issues
   numbers that do. */
const nextLocalCode = (containers: Container[], prefix: string): string => {
  const used = containers
    .filter((c) => c.code.startsWith(prefix))
    .map((c) => Number(c.code.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(4, '0')}`
}

export function createLocalContainerRepo(): ContainerRepo {
  let containers: Container[] = []

  /* One place for "find it, check the move is legal, apply the patch". Every transition below
     shares it, so a guard cannot be forgotten on one of them. */
  const step = (
    id: string,
    verb: string,
    allowed: (c: Container) => boolean,
    patch: (c: Container) => Partial<Container>,
  ): Container => {
    const idx = containers.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error(`${verb}: container ${id} not found`)
    const current = containers[idx]
    if (!allowed(current)) {
      throw new Error(`Cannot ${verb} container ${id} from ${current.logisticsStatus ?? 'draft'}`)
    }
    const updated: Container = { ...current, ...patch(current) }
    containers = [...containers.slice(0, idx), updated, ...containers.slice(idx + 1)]
    return { ...updated }
  }

  return {
    async fetchAll() {
      return containers.map((c) => ({ ...c }))
    },
    async create(input: CreateContainerInput): Promise<Container> {
      const now = new Date().toISOString()
      const displayOrder = input.displayOrder ?? containers.length
      const container: Container = {
        id: `container-${nextId++}`,
        code: nextLocalCode(containers, input.supplierCode),
        status: 'draft',
        name: input.name,
        type: input.type,
        destination: input.destination,
        supplierId: input.supplierId,
        capacityCbm: input.capacityCbm,
        displayOrder,
        ofqReference: null,
        committedAt: null,
        committedBy: null,
        createdAt: now,
        logisticsStatus: null,
        bookedAt: null,
        bookedBy: null,
        booking: null,
        schedule: null,
        scheduledAt: null,
        scheduledBy: null,
        shippedAt: null,
        shippedBy: null,
      }
      containers = [...containers, container]
      return { ...container }
    },
    async delete(id) {
      containers = containers.filter((c) => c.id !== id)
    },
    async updateCapacity(id, capacityCbm): Promise<Container> {
      const idx = containers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error(`updateCapacity: container ${id} not found`)
      const updated: Container = { ...containers[idx], capacityCbm }
      containers = [
        ...containers.slice(0, idx),
        updated,
        ...containers.slice(idx + 1),
      ]
      return { ...updated }
    },
    async commit(id, ofqReference): Promise<Container> {
      const idx = containers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error(`commit: container ${id} not found`)
      const updated: Container = {
        ...containers[idx],
        status: 'committed',
        ofqReference,
        committedAt: new Date().toISOString(),
        committedBy: LOCAL_ACTOR,
        logisticsStatus: 'committed',
      }
      containers = [
        ...containers.slice(0, idx),
        updated,
        ...containers.slice(idx + 1),
      ]
      return { ...updated }
    },
    async uncommit(id): Promise<Container> {
      const idx = containers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error(`uncommit: container ${id} not found`)
      const updated: Container = {
        ...containers[idx],
        status: 'draft',
        ofqReference: null,
        committedAt: null,
        committedBy: null,
        logisticsStatus: null,
        bookedAt: null,
        bookedBy: null,
        booking: null,
        schedule: null,
        scheduledAt: null,
        scheduledBy: null,
        shippedAt: null,
        shippedBy: null,
      }
      containers = [
        ...containers.slice(0, idx),
        updated,
        ...containers.slice(idx + 1),
      ]
      return { ...updated }
    },
    /*
      Named transitions, mirroring the SQL functions — including their source-state guards, so
      the local and Supabase backends cannot disagree about which moves are legal. Identity is a
      placeholder here: this repo has no session, and nothing reads these stamps in local mode.
    */
    async book(id, booking) {
      return step(id, 'book', (c) => c.logisticsStatus === 'committed', () => ({
        logisticsStatus: 'booked' as const,
        booking,
        bookedAt: new Date().toISOString(),
        bookedBy: LOCAL_ACTOR,
      }))
    },

    async unbook(id) {
      return step(id, 'un-book', (c) => c.logisticsStatus === 'booked', () => ({
        logisticsStatus: 'committed' as const,
        booking: null,
        bookedAt: null,
        bookedBy: null,
      }))
    },

    async reviseBooking(id, booking) {
      return step(
        id,
        'revise booking',
        (c) => c.logisticsStatus === 'booked' || c.logisticsStatus === 'scheduled'
            || c.logisticsStatus === 'shipped',
        () => ({ booking }),   // stamps untouched: a correction does not change who booked it
      )
    },

    async schedule(id, schedule) {
      return step(
        id,
        'schedule',
        (c) => c.logisticsStatus === 'booked' || c.logisticsStatus === 'scheduled'
            || c.logisticsStatus === 'shipped',
        (c) =>
          c.logisticsStatus === 'booked'
            ? {
                logisticsStatus: 'scheduled' as const,
                schedule,
                scheduledAt: new Date().toISOString(),
                scheduledBy: LOCAL_ACTOR,
              }
            : { schedule },   // revision: keep the first-scheduled stamps, stay put
      )
    },

    async unschedule(id) {
      return step(id, 'un-schedule', (c) => c.logisticsStatus === 'scheduled', () => ({
        logisticsStatus: 'booked' as const,
        schedule: null,
        scheduledAt: null,
        scheduledBy: null,
      }))
    },

    async ship(id) {
      return step(id, 'ship', (c) => c.logisticsStatus === 'scheduled', () => ({
        logisticsStatus: 'shipped' as const,
        shippedAt: new Date().toISOString(),
        shippedBy: LOCAL_ACTOR,
      }))
    },

    async unship(id) {
      // The schedule survives — un-shipping says the sailing has not happened, not that the
      // routing was wrong.
      return step(id, 'un-ship', (c) => c.logisticsStatus === 'shipped', () => ({
        logisticsStatus: 'scheduled' as const,
        shippedAt: null,
        shippedBy: null,
      }))
    },
  }
}
