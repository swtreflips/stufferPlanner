import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { AlertTriangle, Upload } from 'lucide-react'
import { masterItemRepo } from '../../data/repos'
import {
  parsePlannerInput,
  type SnapshotRow,
} from '../../utils/plannerInputParser'
import type { ImportBatch, SyncSummary } from '../../types/sync'
import { REASON_LABELS } from './reasons'

/**
 * The weekly upload: pick → preview → apply.
 *
 * THE PREVIEW IS NOT A SIMULATION. `planner_sync_preview` and `sync_po_lines` run the same diff
 * function server-side; the preview is that calculation with the writing half left off. So the
 * counts on the confirm screen are not an estimate of what the apply will do — they are the
 * apply's own arithmetic, shown early. Nothing here re-derives them, because a second opinion
 * computed in the browser is exactly how a preview starts lying.
 *
 * Which is also why parsing is all this file does with the data. It turns a CSV into rows and
 * hands them over; every judgement about what those rows MEAN — new, changed, gone, and why —
 * belongs to the transaction that acts on them.
 */

type Phase = 'pick' | 'preview' | 'done'

interface Props {
  /** Fired after a successful apply so the closures list beside this can catch up. */
  onApplied(): void
}

export default function PoSyncPanel({ onApplied }: Props) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<SnapshotRow[]>([])
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [force, setForce] = useState(false)
  const [batches, setBatches] = useState<ImportBatch[]>([])

  const loadBatches = useCallback(() => {
    void masterItemRepo
      .fetchImportBatches(5)
      .then(setBatches)
      .catch(() => setBatches([]))
  }, [])

  useEffect(loadBatches, [loadBatches])

  const reset = () => {
    setPhase('pick')
    setFileName('')
    setRows([])
    setSummary(null)
    setError(null)
    setForce(false)
  }

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      const parsed = parsePlannerInput(await file.text())
      if (!parsed.ok) {
        setError(parsed.fatalError ?? 'Could not read that file.')
        setFileName(file.name)
        return
      }
      // The preview round-trips to the database rather than diffing here, so an unknown vendor
      // or a duplicated key is reported by the same code that would refuse the apply.
      const result = await masterItemRepo.previewSync(parsed.rows)
      setFileName(file.name)
      setRows(parsed.rows)
      setSummary(result)
      setPhase('preview')
    } catch (err) {
      setFileName(file.name)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const handleApply = async () => {
    if (!summary) return
    setBusy(true)
    setError(null)
    try {
      const result = await masterItemRepo.applySync(rows, force)
      setSummary(result)
      setPhase('done')
      loadBatches()
      onApplied()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const nothingToDo =
    summary !== null &&
    summary.inserted + summary.updated + summary.closed + summary.reopened === 0

  return (
    <div className="p-5 space-y-4">
      {phase === 'pick' ? (
        <DropZone
          busy={busy}
          onPick={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f) void handleFile(f)
          }}
        />
      ) : null}

      {error ? (
        <div className="rounded-lg border border-coral-accent/30 bg-coral-accent/5 px-3 py-2.5 text-xs text-coral-accent">
          {error}
          {phase !== 'pick' ? null : (
            <span className="block mt-1 text-navy-500">
              Nothing was written. Fix the file and try again.
            </span>
          )}
        </div>
      ) : null}

      {phase === 'preview' && summary ? (
        <>
          <div className="text-[11px] font-mono uppercase tracking-widest text-navy-500">
            {fileName} · {summary.rowsInFile} rows
          </div>

          <Counts summary={summary} />

          {summary.closed > 0 ? <ClosureBreakdown summary={summary} /> : null}

          {summary.conflicts.length > 0 ? (
            <Conflicts summary={summary} />
          ) : null}

          {summary.blastRadiusExceeded ? (
            <BlastRadius summary={summary} force={force} onForce={setForce} />
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-navy-100">
            <button
              type="button"
              onClick={reset}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-600 hover:bg-navy-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={
                busy || nothingToDo || (summary.blastRadiusExceeded && !force)
              }
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-navy-900 text-navy-50 hover:bg-navy-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {nothingToDo
                ? 'Nothing to apply'
                : `Apply ${summary.inserted + summary.updated + summary.closed + summary.reopened} changes`}
            </button>
          </div>
        </>
      ) : null}

      {phase === 'done' && summary ? (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-teal-accent">
            Applied {fileName}.
          </div>
          <Counts summary={summary} />
          {summary.conflicts.length > 0 ? (
            <p className="text-xs text-navy-500">
              {summary.conflicts.length}{' '}
              {summary.conflicts.length === 1 ? 'conflict was' : 'conflicts were'}{' '}
              recorded — the containers involved are flagged on the board.
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-600 hover:bg-navy-100 transition-colors"
          >
            Upload another
          </button>
        </div>
      ) : null}

      {batches.length > 0 ? <History batches={batches} /> : null}
    </div>
  )
}

function DropZone({
  busy,
  onPick,
  onDrop,
}: {
  busy: boolean
  onPick: (e: ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="relative border-2 border-dashed border-navy-200 rounded-xl p-8 text-center bg-navy-50/60 hover:border-amber-accent transition-colors"
    >
      <Upload className="w-6 h-6 mx-auto text-navy-400" />
      <div className="mt-2 text-sm text-navy-700">
        {busy ? 'Checking the file…' : 'Drop the PO export here, or click to choose it.'}
      </div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-navy-400">
        Document Number · Item · Supplier · Quantity Available
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={onPick}
        disabled={busy}
        className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
        aria-label="Choose the PO export"
      />
    </div>
  )
}

function Counts({ summary }: { summary: SyncSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      <Stat n={summary.inserted} label="new" tone="teal" />
      <Stat n={summary.updated} label="changed" tone="navy" />
      <Stat n={summary.closed} label="closed" tone="coral" />
      <Stat n={summary.reopened} label="reopened" tone="amber" />
      <Stat n={summary.unchanged} label="unchanged" tone="muted" />
    </div>
  )
}

function Stat({
  n,
  label,
  tone,
}: {
  n: number
  label: string
  tone: 'teal' | 'coral' | 'navy' | 'amber' | 'muted'
}) {
  // `amber` here is the module accent, which is green in this skin — right for "reopened",
  // which is a recovery rather than a warning. Only `coral` means something needs attention.
  const cls = {
    teal: 'border-teal-accent/30 bg-teal-accent/5 text-teal-accent',
    coral: 'border-coral-accent/30 bg-coral-accent/5 text-coral-accent',
    amber: 'border-amber-accent/30 bg-amber-accent/5 text-amber-accent',
    navy: 'border-navy-200 bg-navy-50 text-navy-800',
    muted: 'border-navy-100 bg-white text-navy-400',
  }[tone]
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-lg font-semibold leading-none tabular-nums">{n}</div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest">
        {label}
      </div>
    </div>
  )
}

/**
 * Why the sync thinks each line left. Worded as a guess throughout — "likely" is not softening,
 * it is accurate: the export states that a row is gone and never why.
 */
function ClosureBreakdown({ summary }: { summary: SyncSummary }) {
  const entries = Object.entries(summary.closedByReason) as [
    keyof typeof REASON_LABELS,
    number,
  ][]
  if (entries.length === 0) return null

  return (
    <p className="text-xs text-navy-600">
      Of the {summary.closed} closing,{' '}
      {entries
        .map(([reason, n]) => `${n} ${REASON_LABELS[reason].likely}`)
        .join(', ')}
      . You can confirm or correct any of these under Closed lines.
    </p>
  )
}

/*
  Deliberately NOT tinted with `amber-accent`. That token is this module's GREEN (#25864a) — the
  name is left over from the old palette, per the note in index.css. A warning drawn in the
  module's own accent reads as success, which is the opposite of what a conflict is.

  It is also not full coral: these apply anyway, so they must stay visibly less alarming than
  the blast-radius block below, which actually stops the run. Neutral surface, coral marker.
*/
function Conflicts({ summary }: { summary: SyncSummary }) {
  return (
    <div className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-navy-800">
        <AlertTriangle className="w-3.5 h-3.5 text-coral-accent" />
        {summary.conflicts.length}{' '}
        {summary.conflicts.length === 1 ? 'conflict' : 'conflicts'} with work already
        planned
      </div>
      <ul className="mt-2 space-y-1">
        {summary.conflicts.map((c, i) => (
          <li key={i} className="font-mono text-[11px] text-navy-600">
            {c.documentNumber} · {c.sku} —{' '}
            {c.conflict === 'closed_while_allocated'
              ? `closing, but ${c.allocated} cases are in a container`
              : c.conflict === 'over_committed'
                ? 'the new quantity is below what is already committed'
                : 'the supplier changed on an allocated line'}
          </li>
        ))}
      </ul>
      {/* Applying anyway is the right default: the ERP is the source of truth, and a planner
          who disagrees needs to see the disagreement, not be blocked by it. */}
      <p className="mt-2 text-[11px] text-navy-500">
        These apply as-is. Nothing is removed from a container — the cards are flagged so someone
        can decide.
      </p>
    </div>
  )
}

function BlastRadius({
  summary,
  force,
  onForce,
}: {
  summary: SyncSummary
  force: boolean
  onForce: (v: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-coral-accent/40 bg-coral-accent/5 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-coral-accent">
        <AlertTriangle className="w-3.5 h-3.5" />
        This file closes {summary.closed} of {summary.openLinesInScope} open lines
      </div>
      <p className="mt-1 text-[11px] text-navy-600">
        That is a large share at once. A partial download or a filter left on the export looks
        exactly like this. Check the row count against NetSuite before continuing.
      </p>
      <label className="mt-2 flex items-center gap-2 text-xs text-navy-700 cursor-pointer">
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => onForce(e.target.checked)}
          className="accent-coral-accent"
        />
        I checked — this export really is this much smaller
      </label>
    </div>
  )
}

function History({ batches }: { batches: ImportBatch[] }) {
  return (
    <details className="pt-2 border-t border-navy-100">
      <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-navy-400">
        Recent uploads
      </summary>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-navy-400">
            <th className="py-1 font-semibold">When</th>
            <th className="py-1 font-semibold">Source</th>
            <th className="py-1 font-semibold text-right">New</th>
            <th className="py-1 font-semibold text-right">Changed</th>
            <th className="py-1 font-semibold text-right">Closed</th>
            <th className="py-1 font-semibold text-right">Reopened</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-t border-navy-100 text-navy-600">
              <td className="py-1.5">
                {new Date(b.pushedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </td>
              <td className="py-1.5 font-mono text-[11px] uppercase">{b.source}</td>
              <td className="py-1.5 text-right tabular-nums">{b.inserted}</td>
              <td className="py-1.5 text-right tabular-nums">{b.updated}</td>
              <td className="py-1.5 text-right tabular-nums">{b.closed}</td>
              <td className="py-1.5 text-right tabular-nums">{b.reopened}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
