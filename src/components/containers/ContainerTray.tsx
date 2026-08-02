import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Container } from '../../types/container'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import ContainerCard from './ContainerCard'
import AddContainerDialog from './AddContainerDialog'
import { CONTAINER_COL, LINE_GRID, LINE_COLUMNS } from './allocationColumns'

interface SupplierGroup {
  supplierId: string
  supplierName: string
  containers: Container[]
}

export default function ContainerTray() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const containers = usePlannerStore((s) => s.containers)
  const suppliers = usePlannerStore((s) => s.suppliers)
  const supplierFilterId = usePlannerStore((s) => s.supplierFilterId)
  const { user } = useAuth()
  const isInternal = user.role === 'internal' || user.role === 'admin'

  // Containers and drafts follow the same focus filter as the grid, for every role. The old
  // code pinned factory users to their own supplierId, which hid a sibling plant's drafts from
  // someone entitled to see them — see the note in OpenPoStatusReport. RLS scopes the rows;
  // this only decides which of those the user is currently looking at.
  const supplierName = (id: string) =>
    suppliers.find((s) => s.id === id)?.name ?? id

  /*
    Ordered the same way as the PO grid on the right: supplier, then destination. The two panes
    are read together — you drag from one into the other — so a container ordered differently
    from the lines that can go into it makes you search rather than scan.

    Internal sorts by supplier first; external has one supplier per view (the plant dropdown
    guarantees it), so that key is constant and destination leads on its own. Same rule as the
    grid, degenerating the same way, rather than a second rule that could drift from it.

    displayOrder remains the final tiebreak, so two containers to the same destination keep the
    order they were created in instead of shuffling on every render.
  */
  const { committed, drafts } = useMemo(() => {
    const scoped = supplierFilterId
      ? containers.filter((c) => c.supplierId === supplierFilterId)
      : containers
    const sorted = [...scoped].sort((a, b) =>
      (isInternal ? supplierName(a.supplierId).localeCompare(supplierName(b.supplierId)) : 0)
      || a.destination.localeCompare(b.destination)
      || a.displayOrder - b.displayOrder,
    )
    return {
      committed: sorted.filter((c) => c.status === 'committed'),
      drafts: sorted.filter((c) => c.status === 'draft'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containers, supplierFilterId, suppliers, isInternal])

  // Cluster by supplier inside each section, with small labels between groups. This used to be
  // "admin/internal only", on the assumption that a factory sees exactly one supplier. Junsun
  // breaks that: two plants, one login. The label is now driven by the DATA — shown whenever
  // the visible set spans more than one supplier — so a Junsun user can tell Thailand from
  // Qingdao, and a single-plant factory is unchanged.
  const groupBySupplier = (list: Container[]): SupplierGroup[] => {
    const bySupplier = new Map<string, Container[]>()
    for (const c of list) {
      const existing = bySupplier.get(c.supplierId)
      if (existing) existing.push(c)
      else bySupplier.set(c.supplierId, [c])
    }
    return Array.from(bySupplier.entries())
      .map(([supplierId, group]) => ({
        supplierId,
        supplierName:
          suppliers.find((s) => s.id === supplierId)?.name ?? supplierId,
        containers: group,
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName))
  }

  const renderGroups = (list: Container[]) => {
    if (new Set(list.map((c) => c.supplierId)).size <= 1) {
      return list.map((c) => <ContainerCard key={c.id} container={c} />)
    }
    return groupBySupplier(list).map((group) => (
      <div key={group.supplierId} className="space-y-3">
        <SupplierLabel name={group.supplierName} />
        {group.containers.map((c) => (
          <ContainerCard key={c.id} container={c} />
        ))}
      </div>
    ))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Global column header — a 40px band that lines up with the master grid header on the
          right and labels the container-card columns. LIGHT, not dark: a column header is
          content furniture, and dark is reserved for global navigation chrome. Matching the
          grid beside it is the whole reason this band exists. See OS/DESIGN.md, "What dark
          means". */}
      <div className="h-10 shrink-0 flex items-center bg-navy-50 border-b border-navy-200">
        <div className="flex items-center w-full px-3">
          <div
            className={`${CONTAINER_COL} shrink-0 text-[10px] font-mono uppercase tracking-widest text-navy-500`}
          >
            Container
          </div>
          <div className="flex-1 min-w-0">
            <div className={`${LINE_GRID} px-2`}>
              {LINE_COLUMNS.map((c) => (
                <span
                  key={c.key}
                  className={`text-[10px] font-mono uppercase tracking-widest text-navy-500 truncate ${
                    c.align === 'right' ? 'text-right' : ''
                  } ${c.key === 'quantity' ? 'pr-3' : ''}`}
                >
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto px-3 py-3 space-y-3"
        style={{ scrollbarGutter: 'stable' }}
      >
        {committed.length === 0 && drafts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {committed.length > 0 ? (
              <Section label="Committed (OFQs)">
                <div className="space-y-3">{renderGroups(committed)}</div>
              </Section>
            ) : null}
            {drafts.length > 0 ? (
              <Section label="Drafts">
                <div className="space-y-3">{renderGroups(drafts)}</div>
              </Section>
            ) : null}
          </>
        )}
      </div>

      <div className="border-t border-navy-200 px-3 py-2.5 bg-white space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400 text-center">
          {committed.length} committed · {drafts.length} drafts
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-navy-300 hover:border-amber-accent text-navy-500 hover:text-amber-accent text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add container
        </button>
      </div>

      <AddContainerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultName={`Container ${drafts.length + committed.length + 1}`}
      />
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400 px-1">
        {label}
      </div>
      {children}
    </section>
  )
}

function SupplierLabel({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span className="h-px flex-1 bg-navy-200" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-navy-500">
        {name}
      </span>
      <span className="h-px flex-1 bg-navy-200" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-navy-400 pt-12">
      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-navy-300 flex items-center justify-center">
        <span className="text-2xl font-mono font-bold text-navy-100">+</span>
      </div>
      <div className="text-center max-w-xs">
        <div className="text-sm font-semibold tracking-wide uppercase text-navy-500">
          No containers yet
        </div>
        <div className="text-xs mt-1 text-navy-400">
          Click <span className="font-mono">Add container</span> to start building an OFQ.
        </div>
      </div>
    </div>
  )
}
