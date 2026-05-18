import { useEffect, useMemo, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileCheck2, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import { formatDate } from '../../utils/dateHelpers'

export default function CommitConfirmDialog() {
  const open = usePlannerStore((s) => s.commitDialog.open)
  const containerId = usePlannerStore((s) => s.commitDialog.containerId)
  const closeCommitDialog = usePlannerStore((s) => s.closeCommitDialog)
  const containers = usePlannerStore((s) => s.containers)
  const allocations = usePlannerStore((s) => s.allocations)
  const masterItems = usePlannerStore((s) => s.masterItems)
  const commitContainer = usePlannerStore((s) => s.commitContainer)
  const { user } = useAuth()

  const onOpenChange = (next: boolean) => {
    if (!next) closeCommitDialog()
  }

  const container = useMemo(
    () => containers.find((c) => c.id === containerId) ?? null,
    [containers, containerId],
  )

  const containerAllocations = useMemo(
    () =>
      containerId
        ? allocations
            .filter((a) => a.containerId === containerId)
            .sort((a, b) => a.displayOrder - b.displayOrder)
        : [],
    [allocations, containerId],
  )

  const summary = useMemo(() => {
    let totalQty = 0
    let totalCbm = 0
    let maxCargoReady: string | null = null
    for (const a of containerAllocations) {
      const item = masterItems.find((m) => m.id === a.masterItemId)
      if (!item) continue
      totalQty += a.quantity
      totalCbm += item.cbmPerCase * a.quantity
      if (!maxCargoReady || item.cargoReady > maxCargoReady) {
        maxCargoReady = item.cargoReady
      }
    }
    return { totalQty, totalCbm, maxCargoReady }
  }, [containerAllocations, masterItems])

  const [ofqReference, setOfqReference] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setOfqReference('')
    setSubmitting(false)
  }, [open])

  if (!container) {
    return null
  }

  const canSubmit = ofqReference.trim().length > 0 && containerAllocations.length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await commitContainer(container.id, ofqReference.trim(), user.id)
      closeCommitDialog()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-navy-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-200">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-navy-900">
              <FileCheck2 className="w-4 h-4 text-teal-accent" />
              Commit container as OFQ
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-navy-400 hover:text-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="px-5 pt-4 text-xs text-navy-500">
            Commit locks the allocations below into an OFQ and reduces master availability
            globally. Allocations can be reversed via Uncommit (admin only).
          </Dialog.Description>

          <div className="px-5 pt-3 pb-2">
            <div className="text-sm font-semibold text-navy-900">{container.name}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
              {container.type} · {container.destination}
            </div>
          </div>

          <div className="px-5 py-3 border-t border-navy-100 max-h-56 overflow-auto">
            <ul className="space-y-1">
              {containerAllocations.map((a) => {
                const item = masterItems.find((m) => m.id === a.masterItemId)
                if (!item) return null
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-navy-900">{item.sku}</span>
                      <span className="ml-2 text-[10px] font-mono uppercase tracking-widest text-navy-400">
                        {item.documentNumber} · line {item.lineId}
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-navy-900 shrink-0">
                      × {a.quantity}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <dl className="px-5 py-3 border-t border-navy-100 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-navy-500">Total cases</dt>
            <dd className="text-right font-mono text-navy-900">{summary.totalQty}</dd>
            <dt className="text-navy-500">Total CBM</dt>
            <dd className="text-right font-mono text-navy-900">{summary.totalCbm.toFixed(2)} m³</dd>
            <dt className="text-navy-500">Effective cargo ready</dt>
            <dd className="text-right font-mono text-navy-900">
              {summary.maxCargoReady ? formatDate(summary.maxCargoReady) : '—'}
            </dd>
          </dl>

          <form onSubmit={handleSubmit} className="px-5 py-4 border-t border-navy-100 space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-navy-500">
              Committing as <span className="text-navy-900">{user.displayName}</span>
            </div>
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-widest text-navy-400 mb-1.5">
                OFQ reference
              </span>
              <input
                type="text"
                value={ofqReference}
                onChange={(e) => setOfqReference(e.target.value)}
                placeholder="e.g. OFQ-2026-014"
                className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
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
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-teal-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Commit OFQ
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
