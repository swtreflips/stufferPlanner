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
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        {lock ? <LockedAvatar lock={lock} /> : null}
        {/* The PO line stopped appearing in the ERP export while these cases were already
            planned into this container. The sync deliberately changes nothing here — it flags
            and leaves the decision to a person, which only works if the person can see it. */}
        {masterItem.isClosed ? (
          <span
            title="This PO line is no longer open in the ERP"
            className="shrink-0 rounded bg-coral-accent/10 px-1 text-[9px] font-mono uppercase tracking-widest text-coral-accent"
          >
            closed
          </span>
        ) : null}
        <span className="truncate font-semibold text-navy-900">{masterItem.sku}</span>
      </span>
      <span className="pr-3 text-right font-mono font-semibold tabular-nums text-navy-900">
        {allocation.quantity}
      </span>
      <span className="min-w-0 truncate font-mono text-navy-500">
        {/* Guarded: formatDate on an empty string renders the literal text "Invalid Date" into
            the card. A line with no cargo ready date yet is ordinary, not an error. */}
        {masterItem.cargoReady ? formatDate(masterItem.cargoReady) : '—'}
      </span>
    </button>
  )
}
