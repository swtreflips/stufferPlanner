import type { Allocation } from '../../types/allocation'
import type { MasterItem } from '../../types/masterItem'

interface Props {
  allocation: Allocation
  masterItem: MasterItem
  onClick?(): void
}

export default function AllocationCard({ allocation, masterItem, onClick }: Props) {
  const interactive = !!onClick
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={
        interactive
          ? 'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left hover:bg-navy-50 transition-colors'
          : 'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left cursor-default'
      }
    >
      <div className="min-w-0">
        <div className="text-xs font-semibold text-navy-900 truncate">
          {masterItem.sku}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400 truncate">
          {masterItem.documentNumber} · line {masterItem.lineId}
        </div>
      </div>
      <span className="text-xs font-mono font-semibold text-navy-900 shrink-0">
        × {allocation.quantity}
      </span>
    </button>
  )
}
