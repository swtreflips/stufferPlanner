import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, HelpCircle } from 'lucide-react'
import { masterItemRepo } from '../../data/repos'
import type { Closure, ConfirmedReason } from '../../types/sync'
import { CONFIRMABLE, REASON_LABELS } from './reasons'

/**
 * Closed PO lines, and the one place a guess becomes a fact.
 *
 * The sync writes `closed_reason_inferred`; a person writes `closed_reason_confirmed`. They are
 * different columns, and they stay visibly different here — an inferred reason renders muted and
 * italic with a "?", a confirmed one renders plainly with a tick. If the two looked alike, the
 * database's careful separation would end at the last pixel and everyone would read a heuristic
 * as a finding.
 *
 * Confirming NEVER overwrites the inference, so "what did the system think, and was it right"
 * stays answerable — which is the only way to find out whether the withdrawn rule is any good.
 */
interface Props {
  /**
   * Bumped by the page when a sync applies. Without it this list loads once on mount and then
   * sits there stale — which had the page stating "1 closed" and "No closed lines. Everything
   * the ERP has ever sent is still open." within a few hundred pixels of each other.
   */
  refreshToken: number
}

export default function ClosedLinesPanel({ refreshToken }: Props) {
  const [closures, setClosures] = useState<Closure[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(() => {
    masterItemRepo
      .fetchClosures()
      .then((rows) => {
        setClosures(rows)
        setError(null)
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
  }, [])

  useEffect(load, [load, refreshToken])

  const unconfirmed = useMemo(
    () => (closures ?? []).filter((c) => !c.reasonIsConfirmed).length,
    [closures],
  )

  if (error) {
    return (
      <div className="p-5 text-xs text-coral-accent">
        Could not load closed lines: {error}
      </div>
    )
  }

  if (closures === null) {
    return (
      <div className="p-5 text-xs font-mono uppercase tracking-widest text-navy-400">
        Loading…
      </div>
    )
  }

  if (closures.length === 0) {
    return (
      <div className="p-5 text-sm text-navy-500">
        No closed lines. Everything the ERP has ever sent is still open.
      </div>
    )
  }

  return (
    <div className="p-5 space-y-3">
      {unconfirmed > 0 ? (
        <p className="text-xs text-navy-500">
          {unconfirmed} of {closures.length} still carry the sync's guess. Confirming one
          replaces the guess with what actually happened; the guess is kept either way.
        </p>
      ) : null}

      <div className="border border-navy-200 rounded-lg overflow-auto max-h-[28rem]">
        <table className="w-full text-xs">
          <thead className="bg-navy-50 sticky top-0">
            <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-navy-500">
              <th className="px-3 py-2 font-semibold">Supplier</th>
              <th className="px-3 py-2 font-semibold">Document</th>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold text-right">Left open</th>
              <th className="px-3 py-2 font-semibold">Closed</th>
              <th className="px-3 py-2 font-semibold">Reason</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {closures.map((c) => (
              <Row
                key={c.id}
                closure={c}
                editing={editing === c.id}
                onEdit={() => setEditing(editing === c.id ? null : c.id)}
                onSaved={() => {
                  setEditing(null)
                  load()
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({
  closure,
  editing,
  onEdit,
  onSaved,
}: {
  closure: Closure
  editing: boolean
  onEdit: () => void
  onSaved: () => void
}) {
  return (
    <>
      <tr className="border-t border-navy-100 even:bg-navy-50/40 align-top">
        <td className="px-3 py-2 text-navy-700">{closure.supplier}</td>
        <td className="px-3 py-2 font-mono">{closure.documentNumber}</td>
        <td className="px-3 py-2 font-mono">{closure.sku}</td>
        <td className="px-3 py-2 text-right tabular-nums text-navy-600">
          {closure.quantityAvailable ?? '—'}
        </td>
        <td className="px-3 py-2 text-navy-500">
          {new Date(closure.closedAt).toLocaleDateString(undefined, {
            dateStyle: 'medium',
          })}
          {closure.daysOpen !== null ? (
            <span className="block text-[10px] text-navy-400">
              after {closure.daysOpen} days
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2">
          <ReasonCell closure={closure} />
          <Flags closure={closure} />
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={onEdit}
            className="text-[10px] font-mono uppercase tracking-widest text-navy-500 hover:text-navy-900 transition-colors"
          >
            {editing ? 'Close' : closure.reasonIsConfirmed ? 'Change' : 'Confirm'}
          </button>
        </td>
      </tr>
      {editing ? (
        <tr className="border-t border-navy-100 bg-navy-50/60">
          <td colSpan={7} className="px-3 py-3">
            <ConfirmForm closure={closure} onSaved={onSaved} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

/**
 * The whole guess-versus-fact distinction, rendered. Muted italic with a "?" for an inference;
 * plain text with a tick for something a person established.
 */
function ReasonCell({ closure }: { closure: Closure }) {
  if (!closure.reason) {
    return <span className="text-navy-300">—</span>
  }

  const label = REASON_LABELS[closure.reason]

  if (closure.reasonIsConfirmed) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-navy-900">
        <Check className="w-3 h-3 text-teal-accent" />
        {label.plain}
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 italic text-navy-500"
      title={label.why}
    >
      <HelpCircle className="w-3 h-3 text-navy-400" />
      {label.likely}
    </span>
  )
}

/** Facts worth surfacing next to the reason, because each one bears on whether it is right. */
function Flags({ closure }: { closure: Closure }) {
  const flags: string[] = []

  if (closure.reopenCount > 0) {
    // A line that has come back before is evidence AGAINST any confident reading of this
    // closure — the last one turned out to be wrong.
    flags.push(
      `came back ${closure.reopenCount} time${closure.reopenCount === 1 ? '' : 's'} before`,
    )
  }
  if (closure.wasAllocated) flags.push('was in a container')
  if (closure.committedQuantity > 0) {
    flags.push(`${closure.committedQuantity} committed`)
  }
  if (closure.note) flags.push(closure.note)

  if (flags.length === 0) return null

  return (
    <span className="block mt-0.5 text-[10px] text-navy-400">
      {flags.join(' · ')}
    </span>
  )
}

function ConfirmForm({
  closure,
  onSaved,
}: {
  closure: Closure
  onSaved: () => void
}) {
  const [reason, setReason] = useState<ConfirmedReason>(
    (closure.reasonIsConfirmed
      ? closure.reason
      : closure.inferredReason === 'unknown'
        ? 'cancelled'
        : closure.inferredReason) as ConfirmedReason,
  )
  const [note, setNote] = useState(closure.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await masterItemRepo.confirmClosureReason(
        closure.id,
        reason,
        note.trim() || null,
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2.5">
      {closure.inferredReason ? (
        <p className="text-[11px] text-navy-500">
          <span className="font-semibold text-navy-600">The sync guessed</span>{' '}
          {REASON_LABELS[closure.inferredReason].likely} —{' '}
          {REASON_LABELS[closure.inferredReason].why}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {CONFIRMABLE.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={`px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${
              reason === r
                ? 'border-navy-900 bg-navy-900 text-navy-50'
                : 'border-navy-200 bg-white text-navy-600 hover:bg-navy-100'
            }`}
          >
            {REASON_LABELS[r].plain}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional) — what actually happened"
        className="w-full px-3 py-1.5 rounded-lg border border-navy-200 bg-white text-xs text-navy-900 focus:outline-none focus:border-amber-accent"
      />

      {error ? <div className="text-[11px] text-coral-accent">{error}</div> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Record it
        </button>
      </div>
    </div>
  )
}
