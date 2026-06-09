import { useDraggable } from '@dnd-kit/core'
import type { Allocation } from '../../types/allocation'
import type { MasterItem } from '../../types/masterItem'
import { masterLockId } from '../../types/lock'
import { usePlannerStore } from '../../store/plannerStore'
import { formatDate } from '../../utils/dateHelpers'
import { LINE_GRID } from './allocationColumns'
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
      sku: masterItem.sku,
      documentNumber: masterItem.documentNumber,
      lineId: masterItem.lineId,
      quantity: allocation.quantity,
    },
  })

  const interactive = !!onClick && !lock

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
      className={`${LINE_GRID} w-full px-2 py-1 rounded text-left text-xs transition-colors ${stateClass}`}
    >
      <span className="min-w-0 truncate font-mono text-navy-600">
        {masterItem.documentNumber}
        {masterItem.lineId > 1 ? (
          <span className="text-navy-400"> ·L{masterItem.lineId}</span>
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        {lock ? <LockedAvatar lock={lock} /> : null}
        <span className="truncate font-semibold text-navy-900">{masterItem.sku}</span>
      </span>
      <span className="text-right font-mono font-semibold tabular-nums text-navy-900">
        {allocation.quantity}
      </span>
      <span className="min-w-0 truncate font-mono text-navy-500">
        {formatDate(masterItem.cargoReady)}
      </span>
    </button>
  )
}
