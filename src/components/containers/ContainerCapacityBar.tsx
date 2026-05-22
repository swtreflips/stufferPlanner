import { useRef, useState } from 'react'
import type { Container } from '../../types/container'
import { clampCapacity, getCapacityConfig } from '../../data/containerCapacity'
import { usePlannerStore } from '../../store/plannerStore'

interface Props {
  container: Container
  totalCbm: number
}

/**
 * On-card CBM fill indicator. Shows how full a container is against its
 * operational cap. For draft containers the cap is editable inline; over-cap is
 * a coral visual warning only — it never blocks allocations.
 */
export default function ContainerCapacityBar({ container, totalCbm }: Props) {
  const updateContainerCapacity = usePlannerStore(
    (s) => s.updateContainerCapacity,
  )
  const [editing, setEditing] = useState(false)
  const [draftValue, setDraftValue] = useState('')
  const cancelRef = useRef(false)

  const cap = container.capacityCbm
  // Placeholder types (no configured capacity) show no bar.
  if (cap === null) return null

  const config = getCapacityConfig(container.type)
  const isDraft = container.status === 'draft'
  const ratio = cap > 0 ? totalCbm / cap : 0
  const pct = Math.round(ratio * 100)
  const over = totalCbm > cap

  const tone =
    ratio > 1
      ? 'text-coral-accent'
      : ratio >= 0.85
        ? 'text-amber-accent'
        : 'text-teal-accent'
  const fillTone =
    ratio > 1
      ? 'bg-coral-accent'
      : ratio >= 0.85
        ? 'bg-amber-accent'
        : 'bg-teal-accent'

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw)
    if (!Number.isNaN(parsed)) {
      const next = clampCapacity(container.type, parsed)
      if (next !== cap) void updateContainerCapacity(container.id, next)
    }
    setEditing(false)
  }

  const startEditing = () => {
    setDraftValue(String(cap))
    setEditing(true)
  }

  return (
    <div className="mt-2">
      <div
        className="h-1.5 rounded-full bg-navy-100 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={Number(totalCbm.toFixed(2))}
        aria-label="Container CBM fill"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillTone}`}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-navy-500">
        <span className={`font-bold ${tone}`}>{pct}%</span>
        <span>of</span>
        {editing ? (
          <input
            type="number"
            min={1}
            max={config?.maxCbm}
            step={1}
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                cancelRef.current = true
                e.currentTarget.blur()
              }
            }}
            onBlur={() => {
              if (cancelRef.current) {
                cancelRef.current = false
                setEditing(false)
                return
              }
              commit(draftValue)
            }}
            className="w-12 px-1 py-0.5 rounded bg-white border border-navy-200 text-navy-900 font-mono text-[10px] text-right focus:outline-none focus:ring-1 focus:ring-amber-accent focus:border-amber-accent"
          />
        ) : isDraft ? (
          <button
            type="button"
            onClick={startEditing}
            title={
              config
                ? `Operational cap — adjustable up to ${config.maxCbm} m³`
                : 'Operational cap'
            }
            className="font-bold text-navy-700 border-b border-dashed border-navy-300 hover:text-amber-accent hover:border-amber-accent transition-colors"
          >
            {cap}
          </button>
        ) : (
          <span className="font-bold text-navy-700">{cap}</span>
        )}
        <span>m³</span>
        {over ? (
          <span className="text-coral-accent">
            · over by {(totalCbm - cap).toFixed(1)} m³
          </span>
        ) : null}
      </div>
    </div>
  )
}
