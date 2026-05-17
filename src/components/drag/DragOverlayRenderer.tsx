import { useDndContext } from '@dnd-kit/core'
import { Package } from 'lucide-react'

export default function DragOverlayRenderer() {
  const { active } = useDndContext()
  if (!active) return null

  const data = active.data.current as
    | {
        type?: string
        sku?: string
        documentNumber?: string
        lineId?: number
        shipTo?: string
      }
    | undefined

  if (data?.type !== 'masterItem') return null

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white shadow-xl border border-amber-accent">
      <Package className="w-3.5 h-3.5 text-amber-accent" />
      <div className="text-xs">
        <div className="font-semibold text-navy-900">{data.sku}</div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
          {data.documentNumber} · line {data.lineId}
        </div>
      </div>
    </div>
  )
}
