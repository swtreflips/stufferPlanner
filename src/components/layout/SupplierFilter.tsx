import { useMemo } from 'react'
import { Filter } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import { supplierLabel } from '../../types/supplier'

/**
 * Supplier focus, in the global header. Scopes the container tray AND the open-PO grid
 * together — a filter that moved one but not the other would put drafts next to lines that
 * cannot be allocated into them.
 *
 * TWO AUDIENCES, one piece of state:
 *
 *   internal / admin   a dropdown over every supplier, plus "All suppliers" — they also keep
 *                      the grid's supplier column, so "all" stays readable.
 *   group suppliers    a dropdown over their OWN plants, with NO "all". Junsun Thailand and
 *                      Qingdao Junsun are one relationship run out of two factories, and a
 *                      Junsun user is entitled to both — one at a time.
 *
 * A single-plant supplier sees nothing here: with one organization there is nothing to choose.
 *
 * THE ASYMMETRY IS THE DESIGN. External users no longer get a supplier column in the grid, so
 * for them this control is not a filter narrowing a labelled list — it IS the label. That only
 * works while exactly one plant is selected, which is why "all" exists for internal and not for
 * them.
 *
 * This control NARROWS what is already on screen. It is not a permission — every row it can
 * reveal was returned by the database for this session, scoped by my_orgs(). The options come
 * from that same function, so the switch cannot offer a plant whose rows RLS would refuse.
 */
export default function SupplierFilter() {
  const { user } = useAuth()
  const suppliers = usePlannerStore((s) => s.suppliers)
  const myOrgIds = usePlannerStore((s) => s.myOrgIds)
  const supplierFilterId = usePlannerStore((s) => s.supplierFilterId)
  const setSupplierFilter = usePlannerStore((s) => s.setSupplierFilter)

  const isInternal = user.role === 'internal' || user.role === 'admin'

  // Resolve my_orgs() uuids against the supplier directory for names and codes, keeping the
  // directory's ordering. An id with no matching row is dropped rather than rendered raw.
  const myOrgs = useMemo(
    () => suppliers.filter((s) => myOrgIds.includes(s.id)),
    [suppliers, myOrgIds],
  )

  if (!isInternal) {
    // One plant, nothing to choose. The account menu already names their company, and with only
    // one organization every row on screen belongs to it by definition.
    if (myOrgs.length < 2) return null

    /*
      NO "ALL PLANTS" OPTION, and that is the point rather than an omission.

      The grid no longer carries a supplier column for external users — it was redundant when
      every row belonged to the one company you work for. For a multi-plant supplier that only
      holds if exactly one plant is selected: "all plants" would show Junsun 34 rows with nothing
      distinguishing Thailand from Qingdao. This dropdown IS the attribution now, so it always
      names one plant, and everything visible belongs to it.

      Switching is how you compare, rather than reading a column.
    */
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-navy-400">
          Plant
        </span>
        <select
          aria-label="Plant"
          value={supplierFilterId ?? myOrgs[0].id}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
        >
          {myOrgs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    )
  }

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
            {supplierLabel(s)}
          </option>
        ))}
      </select>
    </div>
  )
}

