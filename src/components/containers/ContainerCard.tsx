import { useEffect, useMemo, useState } from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { CheckCircle2, FileCheck2, MapPin, RotateCcw, Trash2 } from 'lucide-react'
import type { Container, LogisticsStatus } from '../../types/container'
import { masterLockId } from '../../types/lock'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import { formatDate } from '../../utils/dateHelpers'
import { exceedsCeiling, getCapacityConfig } from '../../data/containerCapacity'
import AllocationCard from './AllocationCard'
import ContainerCapacityBar from './ContainerCapacityBar'

interface Props {
  container: Container
}

interface DraggedItemData {
  type: 'masterItem' | 'allocation'
  shipTo?: string
  supplierId?: string
  allocationId?: string
  masterItemId?: string
  sourceContainerId?: string
}

function isPlannerDragData(data: unknown): data is DraggedItemData {
  if (typeof data !== 'object' || data === null) return false
  const t = (data as { type?: unknown }).type
  return t === 'masterItem' || t === 'allocation'
}

export default function ContainerCard({ container }: Props) {
  const allAllocations = usePlannerStore((s) => s.allocations)
  const masterItems = usePlannerStore((s) => s.masterItems)
  const deleteContainer = usePlannerStore((s) => s.deleteContainer)
  const emptyContainer = usePlannerStore((s) => s.emptyContainer)
  const openAllocationDialog = usePlannerStore((s) => s.openAllocationDialog)
  const openCommitDialog = usePlannerStore((s) => s.openCommitDialog)
  const uncommitContainer = usePlannerStore((s) => s.uncommitContainer)
  const openLogisticsDialog = usePlannerStore((s) => s.openLogisticsDialog)
  const displayNameById = usePlannerStore((s) => s.displayNameById)
  const acquireLock = usePlannerStore((s) => s.acquireLock)
  const isLockedByOther = usePlannerStore((s) => s.isLockedByOther)
  const { user } = useAuth()
  const [denial, setDenial] = useState<string | null>(null)

  useEffect(() => {
    if (!denial) return
    const t = setTimeout(() => setDenial(null), 3000)
    return () => clearTimeout(t)
  }, [denial])

  const isCommitted = container.status === 'committed'
  const canCommit = user.role === 'admin' || user.role === 'internal'
  const canUncommit = user.role === 'admin'
  const logisticsStage: LogisticsStatus = container.logisticsStatus ?? 'committed'
  // Once a committed container moves past 'committed' (booked / scheduled /
  // shipped) it represents a real operational state that can't be undone by
  // clicking a button. Roll back via the Logistics dialog first.
  const uncommitDisabled = logisticsStage !== 'committed'

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
      supplierId: container.supplierId,
    },
  })

  const { active } = useDndContext()
  const activeData = active?.data.current
  const dragInfo = isPlannerDragData(activeData) ? activeData : null
  const destinationMatches =
    dragInfo === null ||
    dragInfo.shipTo === undefined ||
    dragInfo.shipTo === container.destination
  const supplierMatches =
    dragInfo === null ||
    dragInfo.supplierId === undefined ||
    dragInfo.supplierId === container.supplierId
  // Moving an allocation card here from another container would add its CBM on
  // top of this container's current fill. Block the drop if that breaches the
  // structural ceiling. Grid-row drags route through the dialog, which enforces
  // the ceiling itself, so they're never pre-blocked here.
  const cbmFits = (() => {
    if (
      dragInfo?.type !== 'allocation' ||
      !dragInfo.allocationId ||
      dragInfo.sourceContainerId === container.id
    ) {
      return true
    }
    const dragged = allAllocations.find((a) => a.id === dragInfo.allocationId)
    const draggedItem = dragged
      ? masterItems.find((m) => m.id === dragged.masterItemId)
      : undefined
    if (!dragged || !draggedItem) return true
    const projected = metrics.totalCbm + draggedItem.cbmPerCase * dragged.quantity
    return !exceedsCeiling(container.type, projected)
  })()
  const compatibleDrop = destinationMatches && supplierMatches && cbmFits
  const showDropAffordance = !isCommitted && active !== null && dragInfo !== null

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
      : !compatibleDrop
        ? isOver
          ? 'border-coral-accent bg-coral-accent/5'
          : // Incompatible but not hovered: stay neutral — no warning until the
            // user actually drags over this container.
            'border-navy-200'
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
          <h3 className="text-base font-bold font-mono tracking-wide text-navy-900">
            {container.code}
          </h3>
          <div className="text-xs text-navy-500 truncate">{container.name}</div>
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
        {showDropAffordance && isOver && !compatibleDrop ? (
          <div className="text-xs italic text-coral-accent">
            {!destinationMatches
              ? `Destination doesn't match (this container is for ${container.destination}).`
              : !supplierMatches
                ? `Supplier doesn't match (this container is bound to one supplier).`
                : `Would exceed the ${container.type} ceiling (${getCapacityConfig(container.type)?.maxCbm} m³).`}
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
                        : () => {
                            const resourceId = masterLockId(item.id)
                            const blocker = isLockedByOther(resourceId)
                            if (blocker) {
                              setDenial(
                                `${blocker.displayName} is editing this row — try again in a moment.`,
                              )
                              return
                            }
                            const acquired = acquireLock(resourceId, {
                              id: user.id,
                              displayName: user.displayName,
                            })
                            if (!acquired) return
                            openAllocationDialog({
                              kind: 'edit',
                              allocationId: a.id,
                            })
                          }
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
        {denial ? (
          <div className="mt-2 text-[10px] text-coral-accent">{denial}</div>
        ) : null}
        <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-navy-500">
          {metrics.lines} lines · {metrics.totalCbm.toFixed(2)} m³ · {metrics.totalQty} cases
          {metrics.maxCargoReady ? ` · ready ${formatDate(metrics.maxCargoReady)}` : ''}
        </div>
        <ContainerCapacityBar container={container} totalCbm={metrics.totalCbm} />
        {isCommitted ? (
          <LogisticsPillRow
            stage={logisticsStage}
            onOpen={() => openLogisticsDialog(container.id)}
          />
        ) : null}
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
                disabled={uncommitDisabled}
                title={
                  uncommitDisabled
                    ? 'Roll back the logistics stage first'
                    : undefined
                }
                className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded text-navy-500 hover:text-coral-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-navy-500"
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

// Footer pill row on committed cards. Three pills track the post-commit
// lifecycle (booked → scheduled → shipped). The "next pending" pill is tinted
// amber as a subtle hint of what's owed; done pills are filled navy; not-yet
// pills are outlined. Clicking anywhere opens the Logistics dialog.
function LogisticsPillRow({
  stage,
  onOpen,
}: {
  stage: LogisticsStatus
  onOpen: () => void
}) {
  const order: LogisticsStatus[] = ['committed', 'booked', 'scheduled', 'shipped']
  const stageIdx = order.indexOf(stage)
  const pillState = (target: LogisticsStatus): 'done' | 'next' | 'pending' => {
    const targetIdx = order.indexOf(target)
    if (targetIdx <= stageIdx) return 'done'
    if (targetIdx === stageIdx + 1) return 'next'
    return 'pending'
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-3 w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-navy-50 transition-colors group"
      aria-label="Open logistics details"
    >
      <Pill label="Booked" state={pillState('booked')} />
      <Pill label="Scheduled" state={pillState('scheduled')} />
      <Pill label="Shipped" state={pillState('shipped')} />
    </button>
  )
}

function Pill({
  label,
  state,
}: {
  label: string
  state: 'done' | 'next' | 'pending'
}) {
  const dotClass =
    state === 'done'
      ? 'bg-navy-900 border-navy-900'
      : state === 'next'
        ? 'bg-amber-accent/20 border-amber-accent'
        : 'bg-transparent border-navy-300'
  const textClass =
    state === 'done'
      ? 'text-navy-900'
      : state === 'next'
        ? 'text-amber-accent'
        : 'text-navy-400'
  return (
    <span
      className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${textClass}`}
    >
      <span className={`w-2 h-2 rounded-full border ${dotClass}`} />
      {label}
    </span>
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
