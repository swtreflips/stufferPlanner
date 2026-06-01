import { Filter } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'

/**
 * Admin/Internal supplier focus control, mounted in the global header. Scopes
 * both the container tray and the open-PO grid to a single supplier (or "All
 * suppliers", the default). Factory users are already scoped to their own
 * supplier via RLS / user.supplierId, so the control is hidden for them.
 */
export default function SupplierFilter() {
  const { user } = useAuth()
  const suppliers = usePlannerStore((s) => s.suppliers)
  const supplierFilterId = usePlannerStore((s) => s.supplierFilterId)
  const setSupplierFilter = usePlannerStore((s) => s.setSupplierFilter)

  if (user.role === 'factory') return null

  return (
    <div className="flex items-center gap-2">
      <Filter className="w-3.5 h-3.5 text-navy-400" />
      <select
        aria-label="Filter by supplier"
        value={supplierFilterId ?? ''}
        onChange={(e) => setSupplierFilter(e.target.value || null)}
        className="px-3 py-1.5 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
      >
        <option value="">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} · {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}
