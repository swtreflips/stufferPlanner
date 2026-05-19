import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import type { MasterItem } from '../../types/masterItem'
import { masterLockId } from '../../types/lock'
import { usePlannerStore } from '../../store/plannerStore'
import LockedAvatar from '../presence/LockedAvatar'

interface Props {
  masterItem: MasterItem
}

export default function DraggableRowHandle({ masterItem }: Props) {
  const lock = usePlannerStore((s) =>
    s.isLockedByOther(masterLockId(masterItem.id)),
  )

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: masterItem.id,
    disabled: !!lock,
    data: {
      type: 'masterItem',
      masterItemId: masterItem.id,
      shipTo: masterItem.shipTo,
      supplierId: masterItem.supplierId,
      sku: masterItem.sku,
      documentNumber: masterItem.documentNumber,
      lineId: masterItem.lineId,
    },
  })

  if (lock) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LockedAvatar lock={lock} />
      </div>
    )
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Drag ${masterItem.sku}`}
      {...listeners}
      {...attributes}
      className={
        isDragging
          ? 'flex h-full w-full items-center justify-center text-amber-accent cursor-grabbing'
          : 'flex h-full w-full items-center justify-center text-navy-300 hover:text-navy-700 cursor-grab transition-colors'
      }
    >
      <GripVertical className="w-4 h-4" />
    </button>
  )
}
