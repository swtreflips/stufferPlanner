import { useDndContext } from '@dnd-kit/core'
import { Package } from 'lucide-react'

interface DragPreviewData {
  type?: string
  sku?: string
  documentNumber?: string
  lineId?: number
  quantity?: number
}

export default function DragOverlayRenderer() {
  const { active } = useDndContext()
  if (!active) return null

  const data = active.data.current as DragPreviewData | undefined
  if (data?.type !== 'masterItem' && data?.type !== 'allocation') return null

  return (
    <div className="pointer-events-none flex w-max min-w-[220px] items-center gap-2 whitespace-nowrap rounded-lg border border-amber-accent bg-white px-3 py-2 shadow-2xl rotate-[1.5deg] scale-105 cursor-grabbing">
      <Package className="w-4 h-4 shrink-0 text-amber-accent" />
      <div className="text-xs">
        <div className="font-semibold text-navy-900">{data.sku}</div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
          {data.documentNumber} · line {data.lineId}
          {data.type === 'allocation' && data.quantity !== undefined
            ? ` · × ${data.quantity}`
            : ''}
        </div>
      </div>
    </div>
  )
}
