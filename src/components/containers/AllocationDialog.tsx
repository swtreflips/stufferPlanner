import { useEffect, useMemo, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Package, X } from 'lucide-react'
import { masterLockId } from '../../types/lock'
import { usePlannerStore } from '../../store/plannerStore'

export default function AllocationDialog() {
  const open = usePlannerStore((s) => s.allocationDialog.open)
  const mode = usePlannerStore((s) => s.allocationDialog.mode)
  const closeAllocationDialog = usePlannerStore((s) => s.closeAllocationDialog)
  const masterItems = usePlannerStore((s) => s.masterItems)
  const allocations = usePlannerStore((s) => s.allocations)
  const containers = usePlannerStore((s) => s.containers)
  const availableQty = usePlannerStore((s) => s.availableQty)
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

  const globalAvailable = resolved ? availableQty(resolved.item.id) : 0
  const existingQty = resolved?.existing?.quantity ?? 0
  // Max the user can set this allocation to: current global availability
  // PLUS this allocation's existing quantity (which would be replaced on update).
  const cap = globalAvailable + existingQty

  const [quantity, setQuantity] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)

  // Reset picker selection when the dialog opens fresh.
  useEffect(() => {
    if (!open) return
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
      setQuantity(Math.min(globalAvailable, resolved.item.originalQuantity))
    }
  }, [open, mode, resolved, globalAvailable])

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
  const isEdit = mode?.kind === 'edit'
  const isPickingContainer =
    mode?.kind === 'create' && !mode.containerId && !pickedContainerId
  const noEligibleContainers =
    mode?.kind === 'create' && !mode.containerId && eligibleContainers.length === 0
  const minimum = isEdit ? 0 : 1
  const canSubmit =
    !!container &&
    quantity >= minimum &&
    quantity <= cap &&
    !submitting &&
    quantity !== existingQty

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !container) return
    setSubmitting(true)
    try {
      if (existing) {
        if (quantity === 0) {
          await removeAllocation(existing.id)
        } else {
          await updateAllocation(existing.id, quantity)
        }
      } else {
        await addAllocation({
          containerId: container.id,
          masterItemId: item.id,
          quantity,
        })
      }
      onOpenChange(false)
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
            <dl className="px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-navy-500">Original quantity</dt>
              <dd className="text-right text-navy-900 font-mono">{item.originalQuantity}</dd>
              <dt className="text-navy-500">Committed (OFQs)</dt>
              <dd className="text-right text-navy-900 font-mono">{item.committedQuantity}</dd>
              <dt className="text-navy-500">Allocated in drafts</dt>
              <dd className="text-right text-navy-900 font-mono">
                {item.originalQuantity - item.committedQuantity - globalAvailable}
              </dd>
              <dt className="text-navy-500 font-semibold">Available for this draft</dt>
              <dd className="text-right text-navy-900 font-mono font-semibold">{cap}</dd>
            </dl>
          ) : null}

          <form onSubmit={handleSubmit} className="px-5 py-4 border-t border-navy-100 space-y-3">
            <label className={`block ${container ? '' : 'opacity-40 pointer-events-none'}`}>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-navy-400 mb-1.5">
                Cases to allocate {isEdit ? '(set to 0 to remove)' : ''}
              </span>
              <input
                type="number"
                min={minimum}
                max={cap}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                disabled={!container}
                className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent disabled:cursor-not-allowed"
                autoFocus={!isPickingContainer}
              />
              {container && cap === 0 && !isEdit ? (
                <div className="mt-1 text-[10px] text-coral-accent">
                  No cases available. Empty a draft container holding this PO,
                  or uncommit an OFQ to free up quantity.
                </div>
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
