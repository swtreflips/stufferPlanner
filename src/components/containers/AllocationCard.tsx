import { useDraggable } from '@dnd-kit/core'
import type { Allocation } from '../../types/allocation'
import type { MasterItem } from '../../types/masterItem'
import { masterLockId } from '../../types/lock'
import { usePlannerStore } from '../../store/plannerStore'
import LockedAvatar from '../presence/LockedAvatar'

interface Props {
  allocation: Allocation
  masterItem: MasterItem
  onClick?(): void
}

export default function AllocationCard({ allocation, masterItem, onClick }: Props) {
  const lock = usePlannerStore((s) =>
    s.isLockedByOther(masterLockId(masterItem.id)),
  )

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `allocation-${allocation.id}`,
    disabled: !!lock || !onClick,
    data: {
      type: 'allocation',
      allocationId: allocation.id,
      masterItemId: masterItem.id,
      shipTo: masterItem.shipTo,
      supplierId: masterItem.supplierId,
      sourceContainerId: allocation.containerId,
    },
  })

  const interactive = !!onClick && !lock

  const baseClass =
    'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left transition-colors'
  const stateClass = lock
    ? 'bg-navy-100 cursor-not-allowed'
    : interactive
      ? isDragging
        ? 'opacity-50 cursor-grabbing'
        : 'hover:bg-navy-50 cursor-grab'
      : 'cursor-default'

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      className={`${baseClass} ${stateClass}`}
    >
      <div className="min-w-0">
        <div className="text-xs font-semibold text-navy-900 truncate">
          {masterItem.sku}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400 truncate">
          {masterItem.documentNumber} · line {masterItem.lineId}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {lock ? <LockedAvatar lock={lock} /> : null}
        <span className="text-xs font-mono font-semibold text-navy-900">
          × {allocation.quantity}
        </span>
      </div>
    </button>
  )
}
