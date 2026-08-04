import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, RotateCcw } from 'lucide-react'
import { containerRepo } from '../../data/repos'
import type { ContainerFill } from '../../data/repos/types'
import { allCapacities, setCapacities, type ContainerCapacity } from '../../data/containerCapacity'
import type { ContainerType } from '../../types/container'

/**
 * Container CBM limits, editable.
 *
 * These stopped being constants the moment they became something learned rather than looked up.
 * A 40HC holds 76 m³ of air; what it holds of THIS product, in boxes, stacked by the team at the
 * other end, is a number that only emerges after loading a few dozen — and it should not take a
 * deploy to record what you found out.
 *
 * TWO NUMBERS, DIFFERENT JOBS:
 *
 *   Ceiling      the structural limit. Allocation is refused past it. Roughly fixed — this is
 *                the box. LOWERING it can leave already-loaded containers over capacity, which
 *                is why the save warns first.
 *   Working cap  what a NEW container is created with. Below the ceiling because boxes do not
 *                tessellate. This is the one that moves as the team gets better.
 *
 * NOT RETROACTIVE, and that is the whole safety property. `capacity_cbm` is stamped onto a
 * container at creation, so raising the working cap changes what gets built from now on and
 * leaves every arranged plan exactly as its planner left it. Anyone needing the new number on an
 * existing draft edits that container's own cap on its card.
 */

const LABELS: Record<ContainerType, string> = {
  '20GP': "20' standard",
  '40GP': "40' standard",
  '40HC': "40' high cube",
}

interface Draft {
  maxCbm: string
  defaultOperationalCbm: string
}

export default function CapacityPanel({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState(() => allCapacities())
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [fill, setFill] = useState<ContainerFill[]>([])
  const [savingType, setSavingType] = useState<ContainerType | null>(null)
  const [savedType, setSavedType] = useState<ContainerType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([containerRepo.fetchTypeCapacities(), containerRepo.fetchFill()])
      .then(([capacities, fillRows]) => {
        setCapacities(capacities)
        setRows(allCapacities())
        setFill(fillRows)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(load, [load])

  const draftFor = (type: ContainerType, capacity: ContainerCapacity): Draft =>
    drafts[type] ?? {
      maxCbm: String(capacity.maxCbm),
      defaultOperationalCbm: String(capacity.defaultOperationalCbm),
    }

  const setDraft = (type: ContainerType, patch: Partial<Draft>, capacity: ContainerCapacity) =>
    setDrafts((d) => ({ ...d, [type]: { ...draftFor(type, capacity), ...patch } }))

  const save = async (type: ContainerType, capacity: ContainerCapacity) => {
    const draft = draftFor(type, capacity)
    const next = {
      maxCbm: Number(draft.maxCbm),
      defaultOperationalCbm: Number(draft.defaultOperationalCbm),
    }
    setSavingType(type)
    setError(null)
    try {
      const saved = await containerRepo.updateTypeCapacity(type, next)
      // Install immediately so the board behind this page uses the new limits without a reload —
      // the guards read the module record, not component state.
      setCapacities({ [type]: saved })
      setRows(allCapacities())
      setDrafts((d) => {
        const { [type]: _drop, ...rest } = d
        return rest
      })
      setSavedType(type)
      setTimeout(() => setSavedType(null), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingType(null)
    }
  }

  if (error) {
    return <div className="p-5 text-xs text-coral-accent">Couldn’t load container limits: {error}</div>
  }

  return (
    <div className="p-5 space-y-3">
      <p className="text-xs text-navy-500">
        Changes apply to containers created from now on. Existing containers keep the cap they
        were built with — edit those on the container itself.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-navy-500">
              <th className="py-2 pr-4 font-semibold">Type</th>
              <th className="py-2 pr-4 font-semibold">Working cap</th>
              <th className="py-2 pr-4 font-semibold">Ceiling</th>
              <th className="py-2 pr-4 font-semibold">In use</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ type, capacity }) => (
              <CapacityRow
                key={type}
                type={type}
                capacity={capacity}
                draft={draftFor(type, capacity)}
                fill={fill}
                canEdit={canEdit}
                saving={savingType === type}
                saved={savedType === type}
                onChange={(patch) => setDraft(type, patch, capacity)}
                onReset={() =>
                  setDrafts((d) => {
                    const { [type]: _drop, ...rest } = d
                    return rest
                  })
                }
                onSave={() => save(type, capacity)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {!canEdit && (
        <p className="text-[11px] text-navy-400">
          Read-only — suppliers see these limits but only internal staff can change them.
        </p>
      )}
    </div>
  )
}

function CapacityRow({
  type, capacity, draft, fill, canEdit, saving, saved, onChange, onReset, onSave,
}: {
  type: ContainerType
  capacity: ContainerCapacity
  draft: Draft
  fill: ContainerFill[]
  canEdit: boolean
  saving: boolean
  saved: boolean
  onChange: (patch: Partial<Draft>) => void
  onReset: () => void
  onSave: () => void
}) {
  const max = Number(draft.maxCbm)
  const operational = Number(draft.defaultOperationalCbm)

  const ofType = useMemo(() => fill.filter((f) => f.type === type), [fill, type])

  /*
    Lowering the ceiling is the one edit that reaches backwards. It cannot corrupt anything — the
    guard only bites on the NEXT allocation — but a container already loaded past the new number
    would quietly start reading as over capacity, and the person typing it is the one who should
    find that out. Named, not just counted: "2 containers" is a statistic, "JT0004, DS0006" is
    something you can go and look at.
  */
  const strandedByCeiling = useMemo(
    () => (Number.isFinite(max) ? ofType.filter((f) => f.totalCbm > max) : []),
    [ofType, max],
  )

  const invalid =
    !Number.isFinite(max) || !Number.isFinite(operational) ||
    max <= 0 || operational <= 0 || operational > max

  const dirty =
    max !== capacity.maxCbm || operational !== capacity.defaultOperationalCbm

  return (
    <>
      <tr className="border-t border-navy-100">
        <td className="py-2.5 pr-4">
          <span className="font-semibold text-navy-900">{type}</span>
          <span className="ml-1.5 text-navy-400">{LABELS[type]}</span>
        </td>
        <td className="py-2.5 pr-4">
          <CbmInput
            value={draft.defaultOperationalCbm}
            disabled={!canEdit || saving}
            onChange={(v) => onChange({ defaultOperationalCbm: v })}
          />
        </td>
        <td className="py-2.5 pr-4">
          <CbmInput
            value={draft.maxCbm}
            disabled={!canEdit || saving}
            onChange={(v) => onChange({ maxCbm: v })}
          />
        </td>
        <td className="py-2.5 pr-4 font-mono text-[11px] text-navy-500">
          {ofType.length === 0 ? '—' : `${ofType.length} container${ofType.length === 1 ? '' : 's'}`}
        </td>
        <td className="py-2.5 text-right">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-accent">
              <Check className="h-3 w-3" /> saved
            </span>
          ) : dirty && canEdit ? (
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={onReset}
                title="Discard"
                className="text-navy-400 transition-colors hover:text-navy-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={invalid || saving}
                className="rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-semibold text-navy-50 transition-colors hover:bg-navy-800 disabled:opacity-40"
              >
                Save
              </button>
            </span>
          ) : null}
        </td>
      </tr>

      {dirty && (invalid || strandedByCeiling.length > 0) && (
        <tr>
          <td colSpan={5} className="pb-2.5">
            {invalid ? (
              <p className="text-[11px] text-coral-accent">
                {operational > max
                  ? 'The working cap cannot exceed the ceiling — a new container would be born over its own limit.'
                  : 'Both numbers must be greater than zero.'}
              </p>
            ) : (
              <p className="inline-flex items-start gap-1.5 text-[11px] text-navy-600">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-coral-accent" />
                <span>
                  {strandedByCeiling.length} loaded{' '}
                  {strandedByCeiling.length === 1 ? 'container is' : 'containers are'} already past{' '}
                  {max} m³ — {strandedByCeiling.map((f) => f.code).join(', ')}. They stay as they
                  are; nothing is removed. They will read as over capacity until unpacked.
                </span>
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function CbmInput({
  value, disabled, onChange,
}: {
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={1}
        step="0.5"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded-lg border border-navy-200 bg-navy-50 px-2 py-1 text-right font-mono text-xs text-navy-900 focus:border-amber-accent focus:outline-none disabled:opacity-60"
      />
      <span className="font-mono text-[10px] text-navy-400">m³</span>
    </span>
  )
}
