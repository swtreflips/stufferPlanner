import { useMemo } from 'react'
import { Filter } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'

/**
 * Supplier focus, in the global header. Scopes the container tray AND the open-PO grid
 * together — a filter that moved one but not the other would put drafts next to lines that
 * cannot be allocated into them.
 *
 * TWO AUDIENCES, one piece of state:
 *
 *   internal / admin   a dropdown over every supplier. Long list, default "All".
 *   group suppliers    a segmented switch over their OWN plants only. Junsun Thailand and
 *                      Qingdao Junsun are one relationship run out of two factories, and a
 *                      Junsun user is entitled to both. Two or three options, worth the width.
 *
 * A single-plant supplier sees nothing here: one option plus an "All" that means the same
 * thing is furniture.
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
    if (myOrgs.length < 2) return null
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-navy-400">
          Plant
        </span>
        <div
          role="group"
          aria-label="Switch plant"
          className="flex items-center rounded-lg border border-navy-200 bg-navy-50 p-0.5"
        >
          <PlantButton
            label="All"
            active={supplierFilterId === null}
            onClick={() => setSupplierFilter(null)}
          />
          {myOrgs.map((s) => (
            <PlantButton
              key={s.id}
              label={s.code || s.name}
              title={s.name}
              active={supplierFilterId === s.id}
              onClick={() => setSupplierFilter(s.id)}
            />
          ))}
        </div>
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
            {s.code} · {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function PlantButton({
  label,
  title,
  active,
  onClick,
}: {
  label: string
  title?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-widest transition-colors ${
        active
          ? 'bg-navy-900 text-navy-50'
          : 'text-navy-500 hover:bg-navy-100 hover:text-navy-900'
      }`}
    >
      {label}
    </button>
  )
}
