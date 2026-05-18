import { useEffect, useMemo, useState } from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { CheckCircle2, FileCheck2, MapPin, RotateCcw, Trash2 } from 'lucide-react'
import type { Container } from '../../types/container'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import { formatDate } from '../../utils/dateHelpers'
import AllocationCard from './AllocationCard'

interface Props {
  container: Container
}

interface DraggedMasterItemData {
  type: 'masterItem'
  masterItemId: string
  shipTo: string
  sku: string
  documentNumber: string
  lineId: number
}

function isMasterItemDragData(data: unknown): data is DraggedMasterItemData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'masterItem'
  )
}

export default function ContainerCard({ container }: Props) {
  const allAllocations = usePlannerStore((s) => s.allocations)
  const masterItems = usePlannerStore((s) => s.masterItems)
  const deleteContainer = usePlannerStore((s) => s.deleteContainer)
  const emptyContainer = usePlannerStore((s) => s.emptyContainer)
  const openAllocationDialog = usePlannerStore((s) => s.openAllocationDialog)
  const openCommitDialog = usePlannerStore((s) => s.openCommitDialog)
  const uncommitContainer = usePlannerStore((s) => s.uncommitContainer)
  const displayNameById = usePlannerStore((s) => s.displayNameById)
  const { user } = useAuth()

  const isCommitted = container.status === 'committed'
  const canCommit = user.role === 'admin' || user.role === 'internal'
  const canUncommit = user.role === 'admin'

  const [confirming, setConfirming] = useState(false)

  const allocations = useMemo(
    () =>
      allAllocations
        .filter((a) => a.containerId === container.id)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [allAllocations, container.id],
  )

  const metrics = useMemo(() => {
    let totalQty = 0
    let totalCbm = 0
    let maxCargoReady: string | null = null
    for (const a of allocations) {
      const item = masterItems.find((m) => m.id === a.masterItemId)
      if (!item) continue
      totalQty += a.quantity
      totalCbm += item.cbmPerCase * a.quantity
      if (!maxCargoReady || item.cargoReady > maxCargoReady) {
        maxCargoReady = item.cargoReady
      }
    }
    return { lines: allocations.length, totalQty, totalCbm, maxCargoReady }
  }, [allocations, masterItems])

  const { setNodeRef, isOver } = useDroppable({
    id: container.id,
    disabled: isCommitted,
    data: {
      type: 'container',
      containerId: container.id,
      destination: container.destination,
    },
  })

  const { active } = useDndContext()
  const activeData = active?.data.current
  const draggedShipTo = isMasterItemDragData(activeData) ? activeData.shipTo : null
  const destinationMatches =
    draggedShipTo === null || draggedShipTo === container.destination
  const showDropAffordance =
    !isCommitted && active !== null && isMasterItemDragData(activeData)

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])

  const handleDelete = () => {
    if (confirming) {
      void deleteContainer(container.id)
    } else {
      setConfirming(true)
    }
  }

  const handleEmpty = () => {
    void emptyContainer(container.id)
  }

  const handleCommitClick = () => {
    openCommitDialog(container.id)
  }

  const handleUncommit = () => {
    void uncommitContainer(container.id)
  }

  const dropStateClass = isCommitted
    ? 'border-teal-accent/40'
    : !showDropAffordance
      ? 'border-navy-200 hover:border-navy-300'
      : !destinationMatches
        ? isOver
          ? 'border-coral-accent bg-coral-accent/5'
          : 'border-coral-accent/30 bg-coral-accent/5'
        : isOver
          ? 'border-amber-accent bg-amber-accent/5 ring-2 ring-amber-accent/30'
          : 'border-amber-accent/40 bg-amber-accent/[0.02]'

  return (
    <article
      ref={setNodeRef}
      className={`bg-white rounded-xl shadow-sm border transition-colors ${dropStateClass}`}
    >
      <header className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-navy-900 truncate">
            {container.name}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-navy-400">
            <span className="px-1.5 py-0.5 rounded bg-navy-100 text-navy-700">
              {container.type}
            </span>
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{container.destination}</span>
            </span>
          </div>
        </div>
        <StatusBadge container={container} />
      </header>

      {isCommitted && container.ofqReference ? (
        <div className="px-4 pb-2 text-[10px] font-mono uppercase tracking-widest text-teal-accent">
          {container.ofqReference}
          {container.committedBy
            ? ` · by ${displayNameById(container.committedBy)}`
            : ''}
          {container.committedAt ? ` · ${formatDate(container.committedAt)}` : ''}
        </div>
      ) : null}

      <div className="px-4 py-3 border-t border-navy-100 min-h-[3.5rem]">
        {showDropAffordance && !destinationMatches ? (
          <div className="text-xs italic text-coral-accent">
            Destination doesn't match (this container is for {container.destination}).
          </div>
        ) : allocations.length === 0 ? (
          <div className="text-xs italic text-navy-400">No allocations</div>
        ) : (
          <ul className="space-y-0.5">
            {allocations.map((a) => {
              const item = masterItems.find((m) => m.id === a.masterItemId)
              if (!item) return null
              return (
                <li key={a.id}>
                  <AllocationCard
                    allocation={a}
                    masterItem={item}
                    onClick={
                      isCommitted
                        ? undefined
                        : () =>
                            openAllocationDialog({
                              kind: 'edit',
                              allocationId: a.id,
                            })
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
        <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-navy-500">
          {metrics.lines} lines · {metrics.totalCbm.toFixed(2)} m³ · {metrics.totalQty} cases
          {metrics.maxCargoReady ? ` · ready ${formatDate(metrics.maxCargoReady)}` : ''}
        </div>
      </div>

      <footer className="flex justify-between items-center gap-2 px-4 py-2 border-t border-navy-100">
        <div className="flex gap-1">
          {!isCommitted ? (
            <>
              {allocations.length > 0 ? (
                <button
                  type="button"
                  onClick={handleEmpty}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded text-navy-500 hover:text-amber-accent transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Empty
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleDelete}
                className={
                  confirming
                    ? 'flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded bg-coral-accent/10 text-coral-accent border border-coral-accent/30 transition-colors'
                    : 'flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded text-navy-500 hover:text-coral-accent transition-colors'
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirming ? 'Click again to confirm' : 'Delete'}
              </button>
            </>
          ) : (
            canUncommit && (
              <button
                type="button"
                onClick={handleUncommit}
                className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded text-navy-500 hover:text-coral-accent transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Uncommit
              </button>
            )
          )}
        </div>
        {!isCommitted && canCommit && allocations.length > 0 ? (
          <button
            type="button"
            onClick={handleCommitClick}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded bg-navy-900 text-navy-50 hover:bg-navy-800 transition-colors"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            Commit OFQ
          </button>
        ) : null}
      </footer>
    </article>
  )
}

function StatusBadge({ container }: { container: Container }) {
  if (container.status === 'committed') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-teal-accent/10 text-teal-accent border border-teal-accent/30">
        <CheckCircle2 className="w-3 h-3" />
        committed
      </span>
    )
  }
  return (
    <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-amber-accent/10 text-amber-accent border border-amber-accent/30">
      draft
    </span>
  )
}
