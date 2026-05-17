import { useEffect, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { GitBranch, X } from 'lucide-react'
import type { Container } from '../../types/container'
import { usePlannerStore } from '../../store/plannerStore'

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  container: Container | null
  onComplete?(newScenarioId: string): void
}

export default function TryAlternativeDialog({
  open,
  onOpenChange,
  container,
  onComplete,
}: Props) {
  const tryAlternativeForContainer = usePlannerStore(
    (s) => s.tryAlternativeForContainer,
  )

  const defaultName = container ? `${container.name} — Alternative` : ''
  const [name, setName] = useState(defaultName)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  const canSubmit = name.trim().length > 0 && !!container && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !container) return
    setSubmitting(true)
    try {
      const newScenarioId = await tryAlternativeForContainer(
        container.id,
        name.trim(),
      )
      onComplete?.(newScenarioId)
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
              <GitBranch className="w-4 h-4 text-amber-accent" />
              Try alternative
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-navy-400 hover:text-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="px-5 pt-4 text-xs text-navy-500">
            Creates a new scenario containing copies of every draft in the
            current scenario. <strong>{container?.name ?? 'This container'}</strong>{' '}
            will start empty in the new scenario, ready for a different
            arrangement. The current scenario stays untouched.
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-widest text-navy-400 mb-1.5">
                New scenario name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-navy-900 text-navy-50 hover:bg-navy-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Try alternative
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
