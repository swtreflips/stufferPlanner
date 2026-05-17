import * as Dialog from '@radix-ui/react-dialog'
import { MapPin, X } from 'lucide-react'
import type { Container } from '../../types/container'

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  title?: string
  description?: string
  candidates: Container[]
  onSelect(container: Container): void
}

export default function ContainerPickerDialog({
  open,
  onOpenChange,
  title = 'Pick a container',
  description,
  candidates,
  onSelect,
}: Props) {
  const handlePick = (container: Container) => {
    onSelect(container)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-navy-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-200">
            <Dialog.Title className="text-base font-semibold text-navy-900">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-navy-400 hover:text-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="px-5 pt-4 text-xs text-navy-500">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">
              Select a container from the list.
            </Dialog.Description>
          )}
          <div className="p-5 space-y-2 max-h-80 overflow-auto">
            {candidates.length === 0 ? (
              <div className="text-sm text-navy-400 italic py-4 text-center">
                No matching containers.
              </div>
            ) : (
              candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handlePick(c)}
                  className="w-full flex items-start justify-between gap-2 px-3 py-2 rounded-lg border border-navy-200 hover:border-amber-accent hover:bg-navy-50 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-navy-900 truncate">
                      {c.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-navy-400">
                      <span className="px-1.5 py-0.5 rounded bg-navy-100 text-navy-700">
                        {c.type}
                      </span>
                      <span className="flex items-center gap-0.5 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.destination}</span>
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
