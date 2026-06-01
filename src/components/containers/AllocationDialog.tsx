import { useEffect, useMemo, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Package, X } from 'lucide-react'
import { masterLockId } from '../../types/lock'
import { usePlannerStore } from '../../store/plannerStore'
import {
  CbmCeilingError,
  getCapacityConfig,
  maxCasesWithinCeiling,
} from '../../data/containerCapacity'

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
  const updateAllocation = usePlannerStore((s) => s.updateAllocation)
  const removeAllocation = usePlannerStore((s) => s.removeAllocation)
  const releaseLock = usePlannerStore((s) => s.releaseLock)
  const eligibleContainersForMasterItem = usePlannerStore(
    (s) => s.eligibleContainersForMasterItem,
  )

  // Eligible containers when create mode arrives without a preselected container.
  // We compute this directly off `containers` so it stays reactive.
  const masterItemIdInPlay = mode?.kind === 'create' ? mode.masterItemId : null
  const eligibleContainers = useMemo(
    () => (masterItemIdInPlay ? eligibleContainersForMasterItem(masterItemIdInPlay) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selector reads from store
    [masterItemIdInPlay, containers, masterItems],
  )

  // For create-from-row (no preselected container), this state tracks the picker.
  const [pickedContainerId, setPickedContainerId] = useState<string | null>(null)

  // The effective container ID we're working with.
  const effectiveContainerId =
    mode?.kind === 'create'
      ? mode.containerId ?? pickedContainerId
      : null

  // Which master item are we holding a lock on? Resolved from mode so we can
  // release the right lock when the dialog closes.
  const lockedMasterId = useMemo(() => {
    if (!mode) return null
    if (mode.kind === 'create') return mode.masterItemId
    const allocation = allocations.find((a) => a.id === mode.allocationId)
    return allocation?.masterItemId ?? null
  }, [mode, allocations])

  const onOpenChange = (next: boolean) => {
    if (!next) {
      if (lockedMasterId) releaseLock(masterLockId(lockedMasterId))
      closeAllocationDialog()
    }
  }

  const resolved = useMemo(() => {
    if (!mode) return null
    if (mode.kind === 'edit') {
      const allocation = allocations.find((a) => a.id === mode.allocationId)
      if (!allocation) return null
      const container = containers.find((c) => c.id === allocation.containerId)
      const item = masterItems.find((m) => m.id === allocation.masterItemId)
      if (!container || !item) return null
      return { container, item, existing: allocation }
    }
    const item = masterItems.find((m) => m.id === mode.masterItemId)
    if (!item) return null
    if (!effectiveContainerId) {
      // Still picking — no container yet. Return the item context only.
      return { container: null, item, existing: null }
    }
    const container = containers.find((c) => c.id === effectiveContainerId)
    if (!container) return null
    const existing =
      allocations.find(
        (a) =>
          a.containerId === effectiveContainerId &&
          a.masterItemId === mode.masterItemId,
      ) ?? null
    return { container, item, existing }
  }, [mode, allocations, containers, masterItems, effectiveContainerId])

  const isEdit = mode?.kind === 'edit'

  const globalAvailable = resolved ? availableQty(resolved.item.id) : 0
  const existingQty = resolved?.existing?.quantity ?? 0
  // Quantity semantics depend on the mode:
  //  - edit: the input is the new TOTAL for this line. The existing quantity is
  //    released and re-set, so the cap is availability + the existing quantity.
  //  - create/add: the input is an INCREMENT added on top of any allocation that
  //    already exists for this (container, item). A second drop of the same row
  //    is grouped into the first allocation, not a replacement — so the existing
  //    quantity stays put and the cap is just the remaining availability.
  const qtyCap = isEdit ? globalAvailable + existingQty : globalAvailable

  // Structural-ceiling cap: CBM already committed by the container's *other*
  // allocations leaves only so much headroom for this line. `cbmCap` is the
  // most cases that still fit; `effectiveCap` is whichever limit binds first.
  // In edit mode the existing line is being replaced, so its CBM is excluded
  // from the baseline; in add mode it stays, so it counts against the ceiling.
  const ceilingConfig = resolved?.container
    ? getCapacityConfig(resolved.container.type)
    : null
  const otherCbm =
    resolved?.container
      ? containerCbm(resolved.container.id, resolved.existing?.id ?? null)
      : 0
  const cbmPerCase = resolved?.item?.cbmPerCase ?? 0
  const cbmBaseline = isEdit ? otherCbm : otherCbm + cbmPerCase * existingQty
  const cbmCap =
    resolved?.container
      ? maxCasesWithinCeiling(resolved.container.type, cbmBaseline, cbmPerCase)
      : Infinity
  const effectiveCap = Math.min(qtyCap, cbmCap)
  const currentContainerCbm = otherCbm + cbmPerCase * existingQty
  const cbmBinds = Number.isFinite(cbmCap) && cbmCap < qtyCap

  // Cases of this line that bring the container exactly up to its *operational*
  // cap (the editable per-container target, below the structural ceiling). Used
  // to pick the autofill default — not as a hard limit. Infinity when there is
  // no configured cap or the line contributes no CBM (nothing to cap against).
  const operationalCap = resolved?.container?.capacityCbm ?? null
  const opCapCases =
    operationalCap !== null && cbmPerCase > 0
      ? Math.max(0, Math.floor((operationalCap - currentContainerCbm + 1e-6) / cbmPerCase))
      : Infinity

  const [quantity, setQuantity] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset picker selection when the dialog opens fresh.
  useEffect(() => {
    if (!open) return
    setError(null)
    if (mode?.kind === 'create' && !mode.containerId) {
      setPickedContainerId(eligibleContainers[0]?.id ?? null)
    } else {
      setPickedContainerId(null)
    }
  }, [open, mode, eligibleContainers])

  useEffect(() => {
    if (!open || !resolved || !resolved.container) return
    if (mode?.kind === 'edit' && resolved.existing) {
      setQuantity(resolved.existing.quantity)
    } else {
      // Default to the qty that brings the container up to its operational cap.
      // If the whole available quantity still fits under the cap, default to the
      // full max instead. The user can type more — up to the structural ceiling
      // (effectiveCap) — to intentionally over-fill past the operational cap.
      const toOpCap = Math.min(effectiveCap, opCapCases)
      // Keep the form valid (min 1) when the container is already at its cap but
      // structural room remains; fall to 0 only when nothing can be allocated.
      setQuantity(toOpCap >= 1 ? toOpCap : Math.min(effectiveCap, 1))
    }
  }, [open, mode, resolved, effectiveCap, opCapCases])

  if (!resolved) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-navy-200 p-5">
            <Dialog.Title className="sr-only">Allocation</Dialog.Title>
            <Dialog.Description className="text-sm text-navy-500">
              Loading allocation context…
            </Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  const { container, item, existing } = resolved

  // Live container before → after projection. Recomputes from `quantity`, so it
  // tracks the autofilled max and any edit the user makes.
  const containerAllocations = container
    ? allocations.filter((a) => a.containerId === container.id)
    : []
  const currentLines = containerAllocations.length
  const currentCases = containerAllocations.reduce((sum, a) => sum + a.quantity, 0)
  const currentCbm = currentContainerCbm
  const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
  // Resulting quantity for this line: add stacks onto the existing, edit replaces.
  const resultingLineQty = isEdit ? safeQty : existingQty + safeQty
  const deltaQty = resultingLineQty - existingQty
  const afterLines =
    currentLines +
    (existing ? (resultingLineQty === 0 ? -1 : 0) : safeQty > 0 ? 1 : 0)
  const afterCases = currentCases + deltaQty
  const afterCbm = currentCbm + cbmPerCase * deltaQty
  const opCap = container?.capacityCbm ?? null
  const beforeRatio = opCap && opCap > 0 ? currentCbm / opCap : 0
  const afterRatio = opCap && opCap > 0 ? afterCbm / opCap : 0
  const afterFillTone =
    afterRatio > 1 ? 'bg-coral-accent' : afterRatio >= 0.85 ? 'bg-amber-accent' : 'bg-teal-accent'
  const afterTextTone =
    afterRatio > 1 ? 'text-coral-accent' : afterRatio >= 0.85 ? 'text-amber-accent' : 'text-teal-accent'

  const isPickingContainer =
    mode?.kind === 'create' && !mode.containerId && !pickedContainerId
  const noEligibleContainers =
    mode?.kind === 'create' && !mode.containerId && eligibleContainers.length === 0
  const minimum = isEdit ? 0 : 1
  const canSubmit =
    !!container &&
    quantity >= minimum &&
    quantity <= effectiveCap &&
    !submitting &&
    // Edit must change the value; add just needs a positive increment (already
    // enforced by `minimum`), so no "unchanged" guard there.
    (isEdit ? quantity !== existingQty : true)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !container) return
    setSubmitting(true)
    try {
      setError(null)
      if (isEdit && existing) {
        // Edit replaces this line's quantity (0 removes the allocation).
        if (quantity === 0) {
          await removeAllocation(existing.id)
        } else {
          await updateAllocation(existing.id, quantity)
        }
      } else {
        // Create adds a new assignment. addAllocation merges by SUMMING into any
        // existing (container, item) allocation rather than overwriting it, so a
        // second drop of the same row stacks on top of the first.
        await addAllocation({
          containerId: container.id,
          masterItemId: item.id,
          quantity,
        })
      }
      onOpenChange(false)
    } catch (err) {
      // The store enforces the structural ceiling as a last-resort invariant.
      // The cap above normally prevents reaching it; surface it if it ever does.
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-navy-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-200">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-navy-900">
              <Package className="w-4 h-4 text-amber-accent" />
              {isEdit ? 'Edit allocation' : 'Allocate cases'}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-navy-400 hover:text-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            Allocate cases from {item.sku}
            {container ? ` into ${container.code}` : ''}.
          </Dialog.Description>

          <div className="px-5 pt-4 pb-2">
            <div className="text-sm font-semibold text-navy-900">{item.sku}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
              {item.documentNumber} · line {item.lineId} · {item.name}
            </div>
            {container ? (
              <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-navy-500">
                into <span className="text-navy-900 font-bold">{container.code}</span>
                {' · '}{container.type} · {container.destination}
              </div>
            ) : null}
          </div>

          {mode?.kind === 'create' && !mode.containerId ? (
            <div className="px-5 pb-3">
              <label className="block">
                <span className="block text-[10px] font-mono uppercase tracking-widest text-navy-400 mb-1.5">
                  Add to container
                </span>
                {noEligibleContainers ? (
                  <div className="px-3 py-2 rounded-lg border border-coral-accent/30 bg-coral-accent/5 text-xs text-coral-accent">
                    No draft containers for {item.shipTo} on {item.name}. Create one first.
                  </div>
                ) : (
                  <select
                    value={pickedContainerId ?? ''}
                    onChange={(e) => setPickedContainerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
                  >
                    {eligibleContainers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </div>
          ) : null}

          {container ? (
            <div className="px-5 py-3 space-y-3">
              {/* How many cases can still be assigned from this PO line. */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-navy-500">
                  {isEdit
                    ? 'Available for this line'
                    : existing
                      ? 'Available to add'
                      : 'Available'}
                </span>
                <span className="font-mono font-semibold text-navy-900 tabular-nums">
                  {qtyCap} cases
                </span>
              </div>

              {/* Container state before this movement vs. after it lands. */}
              <div className="rounded-xl border border-navy-200 bg-navy-50/60 overflow-hidden">
                <div className="flex items-center px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-navy-400 border-b border-navy-100">
                  <span className="flex-1 text-navy-500">{container.code}</span>
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
                    <div className="relative h-2 rounded-full bg-navy-100 overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${afterFillTone}`}
                        style={{ width: `${Math.min(afterRatio, 1) * 100}%` }}
                      />
                      {/* Marker at the pre-movement level. */}
                      <div
                        className="absolute inset-y-0 w-0.5 bg-navy-700"
                        style={{ left: `calc(${Math.min(beforeRatio, 1) * 100}% - 1px)` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-navy-500">
                      <span>Fill of {opCap} m³</span>
                      <span>
                        {Math.round(beforeRatio * 100)}%{' '}
                        <span className="text-navy-400">→</span>{' '}
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

          <form onSubmit={handleSubmit} className="px-5 py-4 border-t border-navy-100 space-y-3">
            <label className={`block ${container ? '' : 'opacity-40 pointer-events-none'}`}>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-navy-400 mb-1.5">
                {isEdit
                  ? 'Cases to allocate (set to 0 to remove)'
                  : existing
                    ? `Cases to add (on top of ${existingQty} already here)`
                    : 'Cases to allocate'}
              </span>
              <input
                type="number"
                min={minimum}
                max={Number.isFinite(effectiveCap) ? effectiveCap : undefined}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                disabled={!container}
                className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent disabled:cursor-not-allowed"
                autoFocus={!isPickingContainer}
              />
              {container && qtyCap === 0 && !isEdit ? (
                <div className="mt-1 text-[10px] text-coral-accent">
                  No cases available. Empty a draft container holding this PO,
                  or uncommit an OFQ to free up quantity.
                </div>
              ) : container && effectiveCap === 0 && !isEdit && ceilingConfig ? (
                <div className="mt-1 text-[10px] text-coral-accent">
                  {container.type} is at its structural ceiling of{' '}
                  {ceilingConfig.maxCbm} m³. Use a larger or additional container.
                </div>
              ) : container && cbmBinds && ceilingConfig ? (
                <div className="mt-1 text-[10px] text-coral-accent">
                  Capped at {cbmCap} cases — the {container.type} structural
                  ceiling is {ceilingConfig.maxCbm} m³ (container at{' '}
                  {otherCbm.toFixed(1)} m³).
                </div>
              ) : null}
              {error ? (
                <div className="mt-1 text-[10px] text-coral-accent">{error}</div>
              ) : null}
            </label>
            <div className="flex justify-between gap-2 pt-2">
              {isEdit && existing ? (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={submitting}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-coral-accent hover:bg-coral-accent/10 transition-colors disabled:opacity-50"
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
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-600 hover:bg-navy-100 transition-colors"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-navy-900 text-navy-50 hover:bg-navy-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isEdit ? 'Save' : 'Allocate'}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
