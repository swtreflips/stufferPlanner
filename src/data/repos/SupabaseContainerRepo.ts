import { supabase } from '../../lib/supabase'
import type {
  Container,
  ContainerBooking,
  ContainerSchedule,
  ContainerStatus,
  ContainerType,
  LogisticsStatus,
} from '../../types/container'
import type { ContainerRepo, CreateContainerInput, LogisticsPatch } from './types'

/**
 * Containers, in `planner_containers`.
 *
 * Until this existed, containers resolved to the in-memory local repo whatever VITE_DATA_SOURCE
 * said, so a draft lived in a JavaScript object inside one browser tab. It survived navigation
 * within the SPA and nothing else — no refresh, no second tab, no colleague, no tomorrow. The
 * work looked saved because the UI kept rendering it.
 *
 * RLS decides everything about who may touch what, and it is already exact:
 *   read    internal sees all; a supplier sees its own organizations, siblings included
 *   insert  a supplier may only create DRAFTS, and never pre-committed
 *   update  a supplier may only modify a container while it is still a draft
 *   delete  same
 * There is deliberately no client-side check mirroring any of that. A duplicated rule is a rule
 * free to drift, and the database is the one that actually holds.
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

const fail = (what: string, e: { message: string }) => {
  throw new Error(`${what}: ${e.message}`)
}

// Module-level, not a method: the commit RPCs return void, so the caller still needs the new
// row. Reaching it through `this` would only work while these are invoked off the repo object,
// and would fail silently the day someone destructures a method out of it.
async function fetchOne(id: string): Promise<Container> {
  const { data, error } = await supabase
    .from('planner_containers')
    .select(SELECT)
    .eq('id', id)
    .single()
  if (error) fail('Failed to reload container', error)
  return toContainer(data as unknown as Row)
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
      // display_order is assigned here rather than by the caller when omitted, so two people
      // adding a container at once cannot both claim the same slot from a stale local count.
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
      // Allocations cascade at the database level. Deleting them here first would leave orphans
      // behind whenever the container delete is then refused by RLS.
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
      Commit and uncommit go through SECURITY DEFINER functions, not an UPDATE.

      Two reasons. The identity stamp is taken from auth.uid() server-side, so it records who
      actually did it rather than whoever the client claimed. And RLS forbids a supplier from
      updating a committed container at all — which is correct, and which also means the
      transition itself cannot be an ordinary update, since the row is locked the instant its
      status changes. `committedBy` is accepted for interface compatibility and ignored.
    */
    async commit(id, ofqReference) {
      const { error } = await supabase.rpc('commit_container', {
        p_container_id: id,
        p_ofq_reference: ofqReference,
      })
      if (error) fail('Failed to commit container', error)
      return fetchOne(id)
    },

    async uncommit(id) {
      const { error } = await supabase.rpc('uncommit_container', { p_container_id: id })
      if (error) fail('Failed to uncommit container', error)
      return fetchOne(id)
    },

    async updateLogistics(id, patch: LogisticsPatch) {
      const row: Record<string, unknown> = {}
      // Only keys actually present are sent. Spreading the whole patch would write null over
      // fields the caller never mentioned — un-booking a container by editing its schedule.
      if ('logisticsStatus' in patch) row.logistics_status = patch.logisticsStatus
      if ('bookedAt' in patch) row.booked_at = patch.bookedAt
      if ('bookedBy' in patch) row.booked_by = patch.bookedBy
      if ('booking' in patch) row.booking = patch.booking
      if ('schedule' in patch) row.schedule = patch.schedule
      if ('scheduledAt' in patch) row.scheduled_at = patch.scheduledAt
      if ('scheduledBy' in patch) row.scheduled_by = patch.scheduledBy
      if ('shippedAt' in patch) row.shipped_at = patch.shippedAt
      if ('shippedBy' in patch) row.shipped_by = patch.shippedBy

      const { data, error } = await supabase
        .from('planner_containers')
        .update(row)
        .eq('id', id)
        .select(SELECT)
        .single()
      if (error) fail('Failed to update logistics', error)
      return toContainer(data as unknown as Row)
    },
  }
}
