import { supabase } from '../../lib/supabase'
import type {
  Container,
  ContainerBooking,
  ContainerSchedule,
  ContainerStatus,
  ContainerType,
  LogisticsStatus,
} from '../../types/container'
import type { ContainerRepo, CreateContainerInput } from './types'

/**
 * Containers, in `planner_containers`.
 *
 * Until this existed, containers resolved to the in-memory local repo whatever VITE_DATA_SOURCE
 * said, so a draft lived in a JavaScript object inside one browser tab. It survived navigation
 * within the SPA and nothing else. The work looked saved because the UI kept rendering it.
 *
 * RLS decides who may touch what, and nothing here re-checks it:
 *   read    internal sees all; a supplier sees its own organizations, siblings included
 *   insert  a supplier may create DRAFTS only, never pre-committed
 *   update  a supplier may modify a container only while it is a draft
 *   delete  same
 * A duplicated rule is a rule free to drift, and the database is the one that actually holds.
 */

interface Row {
  id: string
  organization_id: string
  code: string
  name: string | null
  type: string
  destination: string | null
  capacity_cbm: number | null
  display_order: number | null
  status: string
  ofq_reference: string | null
  committed_at: string | null
  committed_by: string | null
  logistics_status: string | null
  booking: ContainerBooking | null
  schedule: ContainerSchedule | null
  booked_at: string | null
  booked_by: string | null
  scheduled_at: string | null
  scheduled_by: string | null
  shipped_at: string | null
  shipped_by: string | null
  created_at: string
}

const SELECT =
  'id, organization_id, code, name, type, destination, capacity_cbm, display_order, status, ' +
  'ofq_reference, committed_at, committed_by, logistics_status, booking, schedule, ' +
  'booked_at, booked_by, scheduled_at, scheduled_by, shipped_at, shipped_by, created_at'

function toContainer(r: Row): Container {
  return {
    id: r.id,
    code: r.code,
    status: r.status as ContainerStatus,
    name: r.name ?? '',
    type: r.type as ContainerType,
    destination: r.destination ?? '',
    supplierId: r.organization_id,
    capacityCbm: r.capacity_cbm,
    displayOrder: r.display_order ?? 0,
    ofqReference: r.ofq_reference,
    committedAt: r.committed_at,
    committedBy: r.committed_by,
    createdAt: r.created_at,
    logisticsStatus: r.logistics_status as LogisticsStatus | null,
    bookedAt: r.booked_at,
    bookedBy: r.booked_by,
    booking: r.booking,
    schedule: r.schedule,
    scheduledAt: r.scheduled_at,
    scheduledBy: r.scheduled_by,
    shippedAt: r.shipped_at,
    shippedBy: r.shipped_by,
  }
}

const fail = (what: string, e: { message: string }): never => {
  throw new Error(`${what}: ${e.message}`)
}

/*
  Every lifecycle transition is one SECURITY DEFINER function, and they all return the updated
  row — so a single helper covers all nine.

  Module-level rather than a method on the returned object: `this` only binds while a method is
  called off that object, so `const { book } = containerRepo` would break it at runtime with
  nothing at compile time to catch it.
*/
async function rpc(fn: string, args: Record<string, unknown>, verb: string): Promise<Container> {
  const { data, error } = await supabase.rpc(fn, args)
  // A refused transition raises inside the function, so it arrives here as `error` carrying the
  // reason the database gave — "container X is not booked" rather than a silent no-op.
  if (error) fail(`Failed to ${verb} container`, error)
  if (!data) throw new Error(`Failed to ${verb} container: no row returned`)
  return toContainer((Array.isArray(data) ? data[0] : data) as Row)
}

export function createSupabaseContainerRepo(): ContainerRepo {
  return {
    async fetchAll() {
      const { data, error } = await supabase
        .from('planner_containers')
        .select(SELECT)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) fail('Failed to load containers', error)
      return (data ?? []).map((r) => toContainer(r as unknown as Row))
    },

    async create(input: CreateContainerInput) {
      // display_order is assigned here when omitted, so two people adding a container at once
      // cannot both claim the same slot from a stale local count.
      let displayOrder = input.displayOrder
      if (displayOrder === undefined) {
        const { count } = await supabase
          .from('planner_containers')
          .select('id', { count: 'exact', head: true })
        displayOrder = count ?? 0
      }

      const { data, error } = await supabase
        .from('planner_containers')
        .insert({
          organization_id: input.supplierId,
          code: input.code,
          name: input.name,
          type: input.type,
          destination: input.destination,
          capacity_cbm: input.capacityCbm,
          display_order: displayOrder,
          status: 'draft',
        })
        .select(SELECT)
        .single()
      if (error) fail('Failed to create container', error)
      return toContainer(data as unknown as Row)
    },

    async delete(id) {
      // Allocations cascade in the database. Deleting them here first would orphan them whenever
      // the container delete is then refused by RLS.
      const { error } = await supabase.from('planner_containers').delete().eq('id', id)
      if (error) fail('Failed to delete container', error)
    },

    async updateCapacity(id, capacityCbm) {
      const { data, error } = await supabase
        .from('planner_containers')
        .update({ capacity_cbm: capacityCbm })
        .eq('id', id)
        .select(SELECT)
        .single()
      if (error) fail('Failed to update capacity', error)
      return toContainer(data as unknown as Row)
    },

    /*
      THE LIFECYCLE. Nine named transitions, no generic patch, and no actor id anywhere.

      Identity comes from auth.uid() inside each function, so booked_by / scheduled_by /
      shipped_by record who acted rather than what the browser claimed. Passing it from the
      client made those columns forgeable, and wrong by accident the first time a stale id got
      through.

      Each function also carries its own source-state guard — book only from committed, ship only
      from scheduled — so the sequence is enforced in the one place that cannot be bypassed,
      rather than by a check in the store the database knew nothing about.
    */
    commit: (id, ofqReference) =>
      rpc('commit_container', { p_container_id: id, p_ofq_reference: ofqReference }, 'commit'),

    uncommit: (id) => rpc('uncommit_container', { p_container_id: id }, 'uncommit'),

    book: (id, booking) =>
      rpc('book_container', { p_container_id: id, p_booking: booking }, 'book'),

    unbook: (id) => rpc('unbook_container', { p_container_id: id }, 'un-book'),

    reviseBooking: (id, booking) =>
      rpc('revise_container_booking', { p_container_id: id, p_booking: booking },
          'revise the booking of'),

    schedule: (id, schedule) =>
      rpc('schedule_container', { p_container_id: id, p_schedule: schedule }, 'schedule'),

    unschedule: (id) => rpc('unschedule_container', { p_container_id: id }, 'un-schedule'),

    ship: (id) => rpc('ship_container', { p_container_id: id }, 'mark shipped'),

    unship: (id) => rpc('unship_container', { p_container_id: id }, 'un-ship'),
  }
}
