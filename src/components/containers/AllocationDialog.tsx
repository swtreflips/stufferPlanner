import { useEffect, useMemo, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Package, X } from 'lucide-react'
import type { ContainerType } from '../../types/container'
import { masterLockId } from '../../types/lock'
import { usePlannerStore } from '../../store/plannerStore'
import {
  CbmCeilingError,
  getCapacityConfig,
  maxCasesWithinCeiling,
} from '../../data/containerCapacity'
import SplitQuantityField from './SplitQuantityField'
import { nextContainerName, previewContainerCode } from './containerNaming'

/*
  ONE DIALOG: source → destination → quantity.

  Three gestures used to mean three different things. Double-clicking a grid row opened a
  container picker; clicking a line in a container opened a quantity box with no picker at all;
  dragging a line between containers moved the WHOLE line with no dialog and no way to move part
  of it. Same decision each time — which cases go where — reached through three different doors.

  Now every path opens the same form. You are always moving cases from somewhere to somewhere:

    from a master row   master list  →  a draft container
    from a container    that container  →  the master list, or another draft container

  DRAG AND DROP IS A SHORTCUT, NOT A REQUIREMENT. Dropping pre-selects the destination and skips
  a step; clicking leaves the dropdown for you to choose. Neither is a separate feature — the
  drop just fills in the field the picker would have.

  Only containers that could actually hold the line are offered: draft status, matching ship-to,
  matching supplier. Filtering rather than rejecting means an impossible move cannot be selected
  in the first place.
*/

const MASTER = '__master__'
/*
  A destination that does not exist yet.

  Kept as a picker option rather than a separate button so there is ONE control for "where do
  these cases go" — and so the case with no eligible containers is the same screen with one
  fewer option, rather than a dead end offering a red message and nothing to click.
*/
const NEW = '__new__'

const CONTAINER_TYPES: ContainerType[] = ['20GP', '40GP', '40HC']

/** One metric row in the before → after container projection. */
function StateRow({
  label,
  now,
  after,
  changed,
}: {
  label: string
  now: number | string
  after: number | string
  changed?: boolean
}) {
  return (
    <div className="flex items-center px-3 py-1.5 text-xs">
      <span className="flex-1 text-navy-500">{label}</span>
      <span className="w-16 text-right font-mono tabular-nums text-navy-400">{now}</span>
      <span
        className={`w-16 text-right font-mono tabular-nums ${changed ? 'font-semibold text-navy-900' : 'text-navy-700'}`}
      >
        {after}
      </span>
    </div>
  )
}

export default function AllocationDialog() {
  const open = usePlannerStore((s) => s.allocationDialog.open)
  const mode = usePlannerStore((s) => s.allocationDialog.mode)
  const closeAllocationDialog = usePlannerStore((s) => s.closeAllocationDialog)
  const masterItems = usePlannerStore((s) => s.masterItems)
  const allocations = usePlannerStore((s) => s.allocations)
  const containers = usePlannerStore((s) => s.containers)
  const availableQty = usePlannerStore((s) => s.availableQty)
  const containerCbm = usePlannerStore((s) => s.containerCbm)
  const addAllocation = usePlannerStore((s) => s.addAllocation)
  const createContainer = usePlannerStore((s) => s.createContainer)
  const suppliers = usePlannerStore((s) => s.suppliers)
  const splitAllocation = usePlannerStore((s) => s.splitAllocation)
  const removeAllocation = usePlannerStore((s) => s.removeAllocation)
  const releaseLock = usePlannerStore((s) => s.releaseLock)
  const eligibleContainersForMasterItem = usePlannerStore(
    (s) => s.eligibleContainersForMasterItem,
  )

  const isEdit = mode?.kind === 'edit'

  /* ── what we are moving, and out of where ──────────────────────────────── */

  const existing = useMemo(
    () => (mode?.kind === 'edit' ? allocations.find((a) => a.id === mode.allocationId) ?? null : null),
    [mode, allocations],
  )

  const item = useMemo(() => {
    if (!mode) return null
    const id = mode.kind === 'create' ? mode.masterItemId : existing?.masterItemId
    return masterItems.find((m) => m.id === id) ?? null
  }, [mode, existing, masterItems])

  /** The container cases are leaving. Null when they are coming out of the master pool. */
  const source = useMemo(
    () => (existing ? containers.find((c) => c.id === existing.containerId) ?? null : null),
    [existing, containers],
  )

  /** Cases on the table: the whole allocation, or everything still unallocated on the line. */
  const total = existing ? existing.quantity : item ? availableQty(item.id) : 0

  /* ── where they can go ─────────────────────────────────────────────────── */

  const eligible = useMemo(
    () =>
      item
        ? eligibleContainersForMasterItem(item.id).filter((c) => c.id !== source?.id)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selector reads from store
    [item, source, containers, masterItems],
  )

  const [destinationId, setDestinationId] = useState<string>(MASTER)

  // Preselect from the gesture. A drop names the destination; a click leaves it to be chosen,
  // defaulting to the master list from a container and to the first eligible box from a row.
  useEffect(() => {
    if (!open || !mode) return
    if (mode.kind === 'edit') setDestinationId(mode.toContainerId ?? MASTER)
    // No eligible container is no longer a dead end — it opens straight onto the creator, which
    // is the only remaining answer to "where do these go".
    else setDestinationId(mode.containerId ?? eligible[0]?.id ?? NEW)
  }, [open, mode, eligible])

  const toMaster = isEdit && destinationId === MASTER
  const toNew = destinationId === NEW
  const destination = useMemo(
    () =>
      destinationId === MASTER || destinationId === NEW
        ? null
        : containers.find((c) => c.id === destinationId) ?? null,
    [destinationId, containers],
  )

  /*
    THE CONTAINER THAT DOES NOT EXIST YET.

    Only two fields, because a PO line already decides the other two: a container is eligible
    only if its destination and supplier match the line, so those are consequences rather than
    choices. Forcing them is also what guarantees the container this makes is one the picker
    would have offered — you cannot build something here that then fails to appear.
  */
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ContainerType>('40HC')

  useEffect(() => {
    if (!open) return
    setNewName(nextContainerName(containers))
    setNewType('40HC')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when the dialog opens
  }, [open])

  const newCodePreview = useMemo(
    () =>
      previewContainerCode(containers, suppliers.find((s) => s.id === item?.supplierId)?.code),
    [containers, suppliers, item],
  )

  /* ── how many may move ─────────────────────────────────────────────────── */

  const cbmPerCase = item?.cbmPerCase ?? 0
  const available = item ? availableQty(item.id) : 0

  // Cases the DESTINATION can still take before its structural ceiling.
  // A new container starts empty, so everything the TYPE can hold is available to it.
  const destCap = destination
    ? maxCasesWithinCeiling(destination.type, containerCbm(destination.id), cbmPerCase)
    : toNew
      ? maxCasesWithinCeiling(newType, 0, cbmPerCase)
      : Infinity

  /*
    `keep` stays in the source; the remainder moves. The bounds differ by direction:

    to a container  you cannot send more than is on the table, and cannot send more than fits —
                    so keep has a FLOOR of whatever the destination has to refuse.
    to the master   there is no ceiling to breach on the way out, and keeping MORE than is here
                    means drawing further cases IN, bounded by what is still unallocated and by
                    the source container's own ceiling.
  */
  const keepMax = toMaster
    ? Math.min(
        total + available,
        source
          ? maxCasesWithinCeiling(source.type, containerCbm(source.id, existing?.id ?? null), cbmPerCase)
          : Infinity,
      )
    : total
  const keepMin = toMaster ? 0 : Math.max(0, total - destCap)

  const [keep, setKeep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Opening state: from a container, nothing has moved yet. From a row, propose the whole
  // available quantity — the same "fill it" default the single-field version had.
  useEffect(() => {
    if (!open) return
    setError(null)
    setKeep(isEdit ? total : 0)
  }, [open, isEdit, total, destinationId])

  const safeKeep = Number.isFinite(keep) ? keep : 0
  const moved = total - safeKeep

  /* ── the container that changes, projected ─────────────────────────────── */

  // Whichever box the user is deciding about: the one receiving, or — when cases are going back
  // to the pool — the one they are leaving.
  const projected = destination ?? source
  const projectedIsDestination = destination !== null || toNew

  // A container that does not exist yet projects from zero, against its type's operational cap.
  // Answering "will this even fit in a fresh 40HC" before anything is created is most of the
  // reason the creator is here rather than in the tray.
  const newCap = getCapacityConfig(newType)?.defaultOperationalCbm ?? null

  const projectedAllocations =
    projected && !toNew ? allocations.filter((a) => a.containerId === projected.id) : []
  const currentLines = projectedAllocations.length
  const currentCases = projectedAllocations.reduce((s, a) => s + a.quantity, 0)
  const currentCbm = projected && !toNew ? containerCbm(projected.id) : 0

  // Cases this movement adds to the projected container (negative when it is the one losing).
  const deltaCases = projectedIsDestination ? moved : safeKeep - total
  const alreadyThere = projectedIsDestination
    ? allocations.find((a) => a.containerId === projected?.id && a.masterItemId === item?.id)
    : existing
  const afterLines =
    currentLines +
    (alreadyThere
      ? projectedIsDestination
        ? 0
        : safeKeep === 0
          ? -1
          : 0
      : moved > 0
        ? 1
        : 0)
  const afterCases = currentCases + deltaCases
  const afterCbm = currentCbm + cbmPerCase * deltaCases

  const opCap = toNew ? newCap : projected?.capacityCbm ?? null
  const beforeRatio = opCap && opCap > 0 ? currentCbm / opCap : 0
  const afterRatio = opCap && opCap > 0 ? afterCbm / opCap : 0
  const afterFillTone =
    afterRatio > 1 ? 'bg-coral-accent' : afterRatio >= 0.85 ? 'bg-amber-accent' : 'bg-teal-accent'
  const afterTextTone =
    afterRatio > 1 ? 'text-coral-accent' : afterRatio >= 0.85 ? 'text-amber-accent' : 'text-teal-accent'
  const ceilingConfig = getCapacityConfig(toNew ? newType : projected?.type ?? newType)

  /* ── guards ────────────────────────────────────────────────────────────── */

  const lockedMasterId = item?.id ?? null
  const onOpenChange = (next: boolean) => {
    if (!next) {
      if (lockedMasterId) releaseLock(masterLockId(lockedMasterId))
      closeAllocationDialog()
    }
  }

  const changed = isEdit ? safeKeep !== total : moved > 0
  const canSubmit =
    !!item &&
    !submitting &&
    changed &&
    safeKeep >= 0 &&
    safeKeep <= keepMax &&
    safeKeep >= keepMin &&
    (toMaster || !!destination || (toNew && newName.trim().length > 0))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !item) return
    setSubmitting(true)
    setError(null)
    try {
      /*
        Nothing is created until this point. The container and its first allocation land
        together, so cancelling the dialog after filling the form leaves nothing behind — no
        empty draft for somebody to notice and clear up later. You came here to place cases;
        the container is the means.
      */
      let targetId = destination?.id ?? null
      if (toNew) {
        const created = await createContainer({
          name: newName.trim(),
          type: newType,
          // Not choices — the line decides both, which is what makes this container eligible.
          destination: item.shipTo,
          supplierId: item.supplierId,
        })
        targetId = created.id
      }

      if (existing) {
        await splitAllocation(existing.id, safeKeep, targetId)
      } else if (targetId) {
        await addAllocation({ containerId: targetId, masterItemId: item.id, quantity: moved })
      }
      onOpenChange(false)
    } catch (err) {
      // The store enforces the structural ceiling as a last-resort invariant; the caps above
      // normally prevent reaching it. Surface it if it ever does.
      if (err instanceof CbmCeilingError) setError(err.message)
      else throw err
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async () => {
    if (!existing || submitting) return
    setSubmitting(true)
    try {
      await removeAllocation(existing.id)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!item) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-navy-200 p-5">
            <Dialog.Title className="sr-only">Move cases</Dialog.Title>
            <Dialog.Description className="text-sm text-navy-500">
              Loading allocation context…
            </Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  const sourceName = source ? source.code : 'master list'
  const destName = destination ? destination.code : toNew ? (newCodePreview ?? 'new container') : 'master list'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-navy-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-200">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-navy-900">
              <Package className="w-4 h-4 text-amber-accent" />
              Move cases
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-navy-400 hover:text-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            Move cases of {item.sku} from {sourceName} to {destName}.
          </Dialog.Description>

          <div className="px-5 pt-4 pb-2">
            <div className="text-sm font-semibold text-navy-900">{item.sku}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
              {item.documentNumber} · {item.name}
            </div>
            <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-navy-500">
              from <span className="font-bold text-navy-900">{sourceName}</span>
              {' · '}
              {total} cases available
            </div>
          </div>

          {/* THE DESTINATION PICKER — the step drag-and-drop skips. */}
          <div className="px-5 pb-3">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-navy-400">
                Move to
              </span>
              <select
                value={destinationId}
                onChange={(e) => setDestinationId(e.target.value)}
                className="w-full rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-900 focus:border-amber-accent focus:outline-none"
              >
                {/* Only offered when cases are coming OUT of a container — from a master row
                    "back to the master list" would be a no-op dressed as a choice. */}
                {isEdit && <option value={MASTER}>Master list</option>}
                {eligible.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name} · {c.type}
                  </option>
                ))}
                {/* Always last, and always present. This replaced a red "create one first"
                    message that named the problem and offered nothing — and it also covers the
                    case that message never mentioned, where the only eligible container is
                    full. */}
                <option value={NEW}>＋ New container…</option>
              </select>
            </label>

            {/*
              TWO FIELDS, because the line already answered the other two. Supplier and
              destination are shown as STATED FACTS rather than disabled selects — a greyed-out
              dropdown implies a choice that was taken away, when in truth there never was one.
            */}
            {toNew ? (
              <div className="mt-3 space-y-2 rounded-xl border border-amber-accent/30 bg-amber-accent/[0.03] p-3">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-navy-400">
                      Name
                    </span>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-sm text-navy-900 focus:border-amber-accent focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-navy-400">
                      Type
                    </span>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as ContainerType)}
                      className="rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-sm text-navy-900 focus:border-amber-accent focus:outline-none"
                    >
                      {CONTAINER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-navy-500">
                  {item.name} · {item.shipTo}
                  {newCodePreview ? (
                    <>
                      {' · will be '}
                      <span className="font-bold text-amber-accent">{newCodePreview}</span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>

          {projected || toNew ? (
            <div className="px-5 pb-3">
              <div className="overflow-hidden rounded-xl border border-navy-200 bg-navy-50/60">
                <div className="flex items-center border-b border-navy-100 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-navy-400">
                  <span className="flex-1 text-navy-500">
                    {toNew ? newCodePreview ?? 'New container' : projected?.code}
                    <span className="ml-1 text-navy-400">
                      {toNew ? 'new' : projectedIsDestination ? 'receiving' : 'losing'}
                    </span>
                  </span>
                  <span className="w-16 text-right">Now</span>
                  <span className="w-16 text-right">After</span>
                </div>
                <StateRow label="Lines" now={currentLines} after={afterLines} changed={afterLines !== currentLines} />
                <StateRow label="Cases" now={currentCases} after={afterCases} changed={afterCases !== currentCases} />
                <StateRow
                  label="CBM (m³)"
                  now={currentCbm.toFixed(1)}
                  after={afterCbm.toFixed(1)}
                  changed={Math.abs(afterCbm - currentCbm) > 1e-6}
                />
                {opCap !== null ? (
                  <div className="px-3 pb-3 pt-1.5">
                    <div className="relative h-2 overflow-hidden rounded-full bg-navy-100">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${afterFillTone}`}
                        style={{ width: `${Math.min(Math.max(afterRatio, 0), 1) * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 w-0.5 bg-navy-700"
                        style={{ left: `calc(${Math.min(beforeRatio, 1) * 100}% - 1px)` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-navy-500">
                      <span>Fill of {opCap} m³</span>
                      <span>
                        {Math.round(beforeRatio * 100)}% <span className="text-navy-400">→</span>{' '}
                        <span className={`font-bold ${afterTextTone}`}>
                          {Math.round(afterRatio * 100)}%
                        </span>
                      </span>
                    </div>
                    {afterCbm > opCap ? (
                      <div className="mt-1 text-[10px] text-coral-accent">
                        Over operational cap by {(afterCbm - opCap).toFixed(1)} m³
                        {ceilingConfig ? ` · structural ceiling ${ceilingConfig.maxCbm} m³` : ''}.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-3 border-t border-navy-100 px-5 py-4">
            <SplitQuantityField
              total={total}
              keep={safeKeep}
              onKeepChange={setKeep}
              max={Number.isFinite(keepMax) ? keepMax : total}
              keepLabel={`Keep in ${sourceName}`}
              moveLabel={`Move to ${destName}`}
              drawLabel={`Take from ${destName}`}
              disabled={!toMaster && !destination && !toNew}
            />

            {isEdit && safeKeep === 0 && destination === null && !toNew ? (
              <p className="text-[10px] text-coral-accent">
                Keeping none removes this line from {sourceName} entirely.
              </p>
            ) : null}

            {keepMin > 0 && !toMaster && ceilingConfig ? (
              <p className="text-[10px] text-coral-accent">
                {destName} can take at most {destCap} more cases — its {projected?.type} ceiling is{' '}
                {ceilingConfig.maxCbm} m³.
              </p>
            ) : null}

            {total === 0 && !isEdit ? (
              <p className="text-[10px] text-coral-accent">
                No cases available. Empty a draft container holding this PO, or uncommit an OFQ to
                free up quantity.
              </p>
            ) : null}

            {error ? <p className="text-[10px] text-coral-accent">{error}</p> : null}

            <div className="flex justify-between gap-2 pt-2">
              {existing ? (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={submitting}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-coral-accent transition-colors hover:bg-coral-accent/10 disabled:opacity-50"
                >
                  Remove allocation
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-navy-600 transition-colors hover:bg-navy-100"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-navy-50 transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {toNew ? 'Create & move' : 'Move'}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
