import { useId } from 'react'
import { ArrowRight } from 'lucide-react'

/**
 * Two linked quantity inputs for splitting a line: what STAYS and what MOVES.
 *
 * Nobody thinks about a part-shipment in one direction only. Standing at a container someone
 * asks "can I still fit these 250?"; standing at the master list the same person asks "how many
 * do I need to pull back?". Those are the same number arrived at from opposite ends, and a
 * single input forces everyone to do the subtraction in their head — which is where the mistakes
 * come from.
 *
 * So both are typeable and each fills in the other. `keep` is the single source of truth; the
 * moved figure is always derived, never stored, so the two cannot drift apart by a rounding or a
 * stale render.
 *
 * BUILT TO BE REUSED. Moving a line between containers is the same shape — keep here, send
 * there — which is why the labels are props and nothing about the master list is baked in.
 *
 * `keep` may exceed `total` when there is more available to draw on. The second field then
 * reverses meaning rather than showing a negative, because "take 100 more" is what the user is
 * actually doing and "−100 moved out" is a puzzle.
 */
export default function SplitQuantityField({
  total,
  keep,
  onKeepChange,
  max,
  keepLabel,
  moveLabel,
  drawLabel,
  disabled = false,
}: {
  /** Cases currently in the source — the number the two fields sum to. */
  total: number
  /** Cases to leave behind. The canonical value. */
  keep: number
  onKeepChange: (next: number) => void
  /** Upper bound for `keep` — `total` plus whatever else can be drawn in. */
  max: number
  keepLabel: string
  /** Wording when cases LEAVE (keep ≤ total). */
  moveLabel: string
  /** Wording when cases are drawn IN instead (keep > total). */
  drawLabel: string
  disabled?: boolean
}) {
  const keepId = useId()
  const moveId = useId()

  const safeKeep = Number.isFinite(keep) ? keep : 0
  const delta = total - safeKeep
  const drawingIn = delta < 0
  const moved = Math.abs(delta)

  const clamp = (n: number) => Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), max)

  return (
    <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label htmlFor={keepId} className="block">
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-navy-400">
            {keepLabel}
          </span>
          <input
            id={keepId}
            type="number"
            min={0}
            max={max}
            value={safeKeep}
            disabled={disabled}
            onChange={(e) => onKeepChange(clamp(Number(e.target.value)))}
            className="w-full rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm tabular-nums text-navy-900 focus:border-amber-accent focus:outline-none"
          />
        </label>

        <ArrowRight
          className={`mb-3 h-3.5 w-3.5 shrink-0 text-navy-300 ${drawingIn ? 'rotate-180' : ''}`}
          aria-hidden
        />

        <label htmlFor={moveId} className="block">
          <span
            className={`mb-1.5 block font-mono text-[10px] uppercase tracking-widest ${
              drawingIn ? 'text-teal-accent' : 'text-navy-400'
            }`}
          >
            {drawingIn ? drawLabel : moveLabel}
          </span>
          <input
            id={moveId}
            type="number"
            min={0}
            // Typing here sets `keep` by subtraction, so its own ceiling is whatever leaves
            // `keep` at zero — you can move everything out, and no more than everything.
            max={total}
            value={moved}
            disabled={disabled}
            onChange={(e) => onKeepChange(clamp(total - Number(e.target.value)))}
            className="w-full rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm tabular-nums text-navy-900 focus:border-amber-accent focus:outline-none"
          />
        </label>
      </div>

      {/* The arithmetic, stated. Two linked fields are only trustworthy if the sum they honour
          is visible — otherwise the second one looks like it is guessing. */}
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-navy-400">
        {drawingIn
          ? `${total} here + ${moved} drawn in = ${safeKeep}`
          : `${safeKeep} + ${moved} = ${total} now in this line`}
      </p>
    </div>
  )
}
