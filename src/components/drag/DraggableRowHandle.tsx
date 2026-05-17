import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import type { MasterItem } from '../../types/masterItem'

interface Props {
  masterItem: MasterItem
}

export default function DraggableRowHandle({ masterItem }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: masterItem.id,
    data: {
      type: 'masterItem',
      masterItemId: masterItem.id,
      shipTo: masterItem.shipTo,
      sku: masterItem.sku,
      documentNumber: masterItem.documentNumber,
      lineId: masterItem.lineId,
    },
  })

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
