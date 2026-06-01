import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Container } from '../../types/container'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import ContainerCard from './ContainerCard'
import AddContainerDialog from './AddContainerDialog'

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

  const isFactory = user.role === 'factory' && user.supplierId !== null
  const factorySupplierId = user.supplierId

  const { committed, drafts } = useMemo(() => {
    const scoped = isFactory
      ? containers.filter((c) => c.supplierId === factorySupplierId)
      : supplierFilterId
        ? containers.filter((c) => c.supplierId === supplierFilterId)
        : containers
    const sorted = [...scoped].sort((a, b) => a.displayOrder - b.displayOrder)
    return {
      committed: sorted.filter((c) => c.status === 'committed'),
      drafts: sorted.filter((c) => c.status === 'draft'),
    }
  }, [containers, isFactory, factorySupplierId, supplierFilterId])

  // For admin/internal we cluster by supplier inside each section, with small
  // labels between groups. Factory view skips this since they only see their
  // own supplier.
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
    if (isFactory) {
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
      <div className="px-6 py-3 border-b border-navy-200 bg-white">
        <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
          Containers
        </div>
        <div className="text-lg font-semibold text-navy-900">
          {committed.length} committed · {drafts.length} drafts
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
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

      <div className="border-t border-navy-200 px-4 py-3 bg-white">
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
        <span className="text-2xl font-mono font-bold text-navy-300">+</span>
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
