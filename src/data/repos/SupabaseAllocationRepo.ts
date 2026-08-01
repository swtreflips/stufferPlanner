import { supabase } from '../../lib/supabase'
import type { Allocation } from '../../types/allocation'
import type { AllocationRepo, CreateAllocationInput } from './types'

/**
 * Allocations, in `planner_allocations` — the quantity of a PO line placed into a container.
 *
 * The column is `po_line_id`; the domain type calls it `masterItemId`. Same thing, and the
 * mapping lives here because translating storage names to domain names is what a repository is
 * for. See STUFFER.md, "The canonical mapping".
 *
 * RLS reaches allocations THROUGH the container: writable only while that container is a draft,
 * and only for an organization the caller belongs to. So "you cannot re-allocate a committed
 * container" is enforced by the database, not by the UI hiding a button — and an allocation can
 * never point at a PO line the caller is not entitled to, because the insert policy checks the
 * line's organization as well as the container's.
 */

interface Row {
  id: string
  container_id: string
  po_line_id: string
  quantity: number
  display_order: number | null
  created_at: string
}

const SELECT = 'id, container_id, po_line_id, quantity, display_order, created_at'

const toAllocation = (r: Row): Allocation => ({
  id: r.id,
  containerId: r.container_id,
  masterItemId: r.po_line_id,
  quantity: Number(r.quantity),
  displayOrder: r.display_order ?? 0,
  createdAt: r.created_at,
})

const fail = (what: string, e: { message: string }) => {
  throw new Error(`${what}: ${e.message}`)
}

export function createSupabaseAllocationRepo(): AllocationRepo {
  return {
    async fetchAll() {
      // No container filter: RLS already restricts these to containers the caller can see, and
      // filtering here as well would be a second copy of that rule, free to drift from it.
      const { data, error } = await supabase
        .from('planner_allocations')
        .select(SELECT)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) fail('Failed to load allocations', error)
      return (data ?? []).map((r) => toAllocation(r as unknown as Row))
    },

    async create(input: CreateAllocationInput) {
      let displayOrder = input.displayOrder
      if (displayOrder === undefined) {
        // Position within THIS container, not globally — the order that matters is the order
        // lines sit inside the box.
        const { count } = await supabase
          .from('planner_allocations')
          .select('id', { count: 'exact', head: true })
          .eq('container_id', input.containerId)
        displayOrder = count ?? 0
      }

      const { data, error } = await supabase
        .from('planner_allocations')
        .insert({
          container_id: input.containerId,
          po_line_id: input.masterItemId,
          quantity: input.quantity,
          display_order: displayOrder,
        })
        .select(SELECT)
        .single()
      if (error) fail('Failed to allocate', error)
      return toAllocation(data as unknown as Row)
    },

    async update(id, quantity) {
      const { error } = await supabase
        .from('planner_allocations')
        .update({ quantity })
        .eq('id', id)
      if (error) fail('Failed to update allocation', error)
    },

    async updateContainerId(id, newContainerId) {
      // Moving a line between boxes. RLS checks BOTH ends: the row is only visible if its
      // current container is writable, and the new container_id must satisfy the same policy —
      // so dragging into a committed container fails at the database rather than half-succeeding.
      const { error } = await supabase
        .from('planner_allocations')
        .update({ container_id: newContainerId })
        .eq('id', id)
      if (error) fail('Failed to move allocation', error)
    },

    async delete(id) {
      const { error } = await supabase.from('planner_allocations').delete().eq('id', id)
      if (error) fail('Failed to remove allocation', error)
    },

    async deleteByContainerId(containerId) {
      // Emptying a container WITHOUT deleting it. The draft itself survives — an empty draft is
      // a deliberate state, and it disappears only when someone actually deletes it.
      const { error } = await supabase
        .from('planner_allocations')
        .delete()
        .eq('container_id', containerId)
      if (error) fail('Failed to empty container', error)
    },
  }
}
