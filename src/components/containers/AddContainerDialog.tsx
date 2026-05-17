import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ContainerType } from '../../types/container'
import { usePlannerStore } from '../../store/plannerStore'

const CONTAINER_TYPES: ContainerType[] = ['20GP', '40GP', '40HC', '45HC']

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  defaultName: string
}

export default function AddContainerDialog({ open, onOpenChange, defaultName }: Props) {
  const masterItems = usePlannerStore((s) => s.masterItems)
  const createContainer = usePlannerStore((s) => s.createContainer)

  const destinations = useMemo(
    () => Array.from(new Set(masterItems.map((m) => m.shipTo))).sort(),
    [masterItems],
  )

  const [name, setName] = useState(defaultName)
  const [destination, setDestination] = useState(destinations[0] ?? '')
  const [type, setType] = useState<ContainerType>('40HC')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setDestination((prev) => (prev && destinations.includes(prev) ? prev : destinations[0] ?? ''))
    setType('40HC')
  }, [open, defaultName, destinations])

  const canSubmit = name.trim().length > 0 && destination.length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await createContainer({ name: name.trim(), destination, type })
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
            <Dialog.Title className="text-base font-semibold text-navy-900">
              New container
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-navy-400 hover:text-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Configure the destination and type of the new draft container.
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
                placeholder="Container name"
                autoFocus
              />
            </Field>
            <Field label="Destination">
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
              >
                {destinations.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ContainerType)}
                className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
              >
                {CONTAINER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
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
                Create
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-mono uppercase tracking-widest text-navy-400 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  )
}
