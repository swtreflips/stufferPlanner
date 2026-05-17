import { useEffect, useMemo, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Package, X } from 'lucide-react'
import { usePlannerStore } from '../../store/plannerStore'

export default function AllocationDialog() {
  const open = usePlannerStore((s) => s.allocationDialog.open)
  const mode = usePlannerStore((s) => s.allocationDialog.mode)
  const closeAllocationDialog = usePlannerStore((s) => s.closeAllocationDialog)
  const onOpenChange = (next: boolean) => {
    if (!next) closeAllocationDialog()
  }
  const masterItems = usePlannerStore((s) => s.masterItems)
  const allocations = usePlannerStore((s) => s.allocations)
  const containers = usePlannerStore((s) => s.containers)
  const currentScenarioId = usePlannerStore((s) => s.currentScenarioId)
  const availableQty = usePlannerStore((s) => s.availableQty)
  const addAllocation = usePlannerStore((s) => s.addAllocation)
  const updateAllocation = usePlannerStore((s) => s.updateAllocation)
  const removeAllocation = usePlannerStore((s) => s.removeAllocation)

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
    const container = containers.find((c) => c.id === mode.containerId)
    const item = masterItems.find((m) => m.id === mode.masterItemId)
    if (!container || !item) return null
    const existing =
      allocations.find(
        (a) =>
          a.containerId === mode.containerId &&
          a.masterItemId === mode.masterItemId,
      ) ?? null
    return { container, item, existing }
  }, [mode, allocations, containers, masterItems])

  const scenarioAvailable = resolved
    ? availableQty(currentScenarioId, resolved.item.id)
    : 0
  const existingQty = resolved?.existing?.quantity ?? 0
  // Max the user can set this allocation to: current availability in the scenario
  // PLUS this allocation's existing quantity (which would be replaced on update).
  const cap = scenarioAvailable + existingQty

  const [quantity, setQuantity] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !resolved) return
    if (mode?.kind === 'edit' && resolved.existing) {
      setQuantity(resolved.existing.quantity)
    } else {
      setQuantity(Math.min(scenarioAvailable, resolved.item.originalQuantity))
    }
  }, [open, mode, resolved, scenarioAvailable])

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
  const minimum = isEdit ? 0 : 1
  const canSubmit =
    quantity >= minimum && quantity <= cap && !submitting && quantity !== existingQty

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
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
            Allocate cases from {item.sku} into {container.name}.
          </Dialog.Description>

          <div className="px-5 pt-4 pb-2">
            <div className="text-sm font-semibold text-navy-900">{item.sku}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
              {item.documentNumber} · line {item.lineId} · {item.name}
            </div>
            <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-navy-500">
              into {container.name} · {container.type} · {container.destination}
            </div>
          </div>

          <dl className="px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-navy-500">Original quantity</dt>
            <dd className="text-right text-navy-900 font-mono">{item.originalQuantity}</dd>
            <dt className="text-navy-500">Committed globally</dt>
            <dd className="text-right text-navy-900 font-mono">{item.committedQuantity}</dd>
            <dt className="text-navy-500">In current scenario</dt>
            <dd className="text-right text-navy-900 font-mono">
              {item.originalQuantity - item.committedQuantity - scenarioAvailable}
            </dd>
            <dt className="text-navy-500 font-semibold">Available for this draft</dt>
            <dd className="text-right text-navy-900 font-mono font-semibold">{cap}</dd>
          </dl>

          <form onSubmit={handleSubmit} className="px-5 py-4 border-t border-navy-100 space-y-3">
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-widest text-navy-400 mb-1.5">
                Cases to allocate {isEdit ? '(set to 0 to remove)' : ''}
              </span>
              <input
                type="number"
                min={minimum}
                max={cap}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
                autoFocus
              />
              {cap === 0 && !isEdit ? (
                <div className="mt-1 text-[10px] text-coral-accent">
                  No cases available in this scenario. (Phase 5.6 will surface the "Try a
                  different arrangement" entry point here.)
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
