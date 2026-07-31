import { supabase } from '../../lib/supabase'
import type { Supplier } from '../../types/supplier'
import type { SupplierRepo } from './types'

/**
 * Suppliers are `organizations` with type='supplier'. There is no `suppliers` table — two
 * apps invented that concept separately, and HUB2 collapsed it into one directory.
 *
 * RLS returns what the caller may see: internal gets every supplier, a factory gets its own
 * organizations including sibling plants. No filtering here.
 */
export function createSupabaseSupplierRepo(): SupplierRepo {
  return {
    async fetchAll() {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, code')
        .eq('type', 'supplier')
        .eq('active', true)
        .order('name')
      if (error) throw new Error(`Failed to load suppliers: ${error.message}`)
      return (data ?? []).map(
        (o): Supplier => ({ id: o.id, name: o.name, code: o.code ?? '' }),
      )
    },
  }
}
