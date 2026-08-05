import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ContainerType } from '../../types/container'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import { previewContainerCode } from './containerNaming'

const CONTAINER_TYPES: ContainerType[] = ['20GP', '40GP', '40HC']

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  defaultName: string
}

export default function AddContainerDialog({ open, onOpenChange, defaultName }: Props) {
  const masterItems = usePlannerStore((s) => s.masterItems)
  const suppliers = usePlannerStore((s) => s.suppliers)
  const createContainer = usePlannerStore((s) => s.createContainer)
  const containers = usePlannerStore((s) => s.containers)
  const myOrgIds = usePlannerStore((s) => s.myOrgIds)
  const supplierFilterId = usePlannerStore((s) => s.supplierFilterId)
  const { user } = useAuth()

  // WHICH SUPPLIERS THIS USER MAY BUILD FOR.
  //
  // Internal picks from the whole directory. A supplier picks from their own organizations —
  // usually exactly one, in which case the control is hidden and the choice is implicit. A
  // group supplier like Junsun has two plants and MUST choose: a container built under
  // Thailand cannot hold Qingdao's lines, and silently defaulting to the primary org would
  // produce drafts that reject half the rows on screen with no explanation.
  const isInternal = user.role === 'internal' || user.role === 'admin'
  const myOrgs = useMemo(
    () => (isInternal ? suppliers : suppliers.filter((s) => myOrgIds.includes(s.id))),
    [isInternal, suppliers, myOrgIds],
  )
  const lockedSupplierId = myOrgs.length === 1 ? myOrgs[0].id : null

  // Open on whatever plant the board is focused on, so "switch to Qingdao, add a container"
  // does the obvious thing without a second selection.
  const [supplierId, setSupplierId] = useState<string>(
    lockedSupplierId ?? supplierFilterId ?? myOrgs[0]?.id ?? '',
  )

  // Destinations the picker offers are the union of destinations present in the
  // master grid for the currently-selected supplier (a container is supplier-
  // bound, so showing destinations for other suppliers makes no sense).
  const destinations = useMemo(() => {
    return Array.from(
      new Set(
        masterItems
          .filter((m) => !supplierId || m.supplierId === supplierId)
          .map((m) => m.shipTo),
      ),
    ).sort()
  }, [masterItems, supplierId])

  const [name, setName] = useState(defaultName)
  const [destinationName, setDestinationName] = useState<string>(
    destinations[0] ?? '',
  )
  const [type, setType] = useState<ContainerType>('40HC')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(defaultName)
    if (lockedSupplierId) {
      setSupplierId(lockedSupplierId)
    } else {
      setSupplierId((prev) =>
        prev && myOrgs.some((s) => s.id === prev)
          ? prev
          : supplierFilterId ?? myOrgs[0]?.id ?? '',
      )
    }
    setType('40HC')
  }, [open, defaultName, myOrgs, lockedSupplierId, supplierFilterId])

  // When supplier changes (or on open), make sure the destination dropdown
  // shows a value valid for that supplier.
  useEffect(() => {
    if (!open) return
    setDestinationName((prev) =>
      prev && destinations.includes(prev) ? prev : destinations[0] ?? '',
    )
  }, [open, destinations])

  // Shared with the allocation dialog's inline creator, so the two cannot number containers
  // differently. See containerNaming.ts for why the preview is indicative.
  const codePreview = useMemo(
    () => previewContainerCode(containers, suppliers.find((s) => s.id === supplierId)?.code),
    [supplierId, suppliers, containers],
  )

  const canSubmit =
    name.trim().length > 0 &&
    supplierId.length > 0 &&
    destinationName.length > 0 &&
    !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await createContainer({
        name: name.trim(),
        destination: destinationName,
        type,
        supplierId,
      })
      onOpenChange(false)
    } catch (err) {
      // There was no catch here at all. A failed create left the dialog open with the button
      // re-enabled and nothing said — which is how a UNIQUE-constraint rejection presented as
      // "the button does nothing sometimes" rather than as an error.
      setError(err instanceof Error ? err.message : String(err))
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
            Configure the supplier, destination, and type of the new draft container.
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
            {/* Hidden when there is only one possible answer — a single-plant supplier is
                bound implicitly. Shown to internal, and to group suppliers with two plants. */}
            {lockedSupplierId ? null : (
              <Field label="Supplier">
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent"
                >
                  {myOrgs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Destination">
              <select
                value={destinationName}
                onChange={(e) => setDestinationName(e.target.value)}
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
            {codePreview ? (
              <div className="text-[10px] font-mono uppercase tracking-widest text-navy-500">
                This will be{' '}
                <span className="text-amber-accent font-bold">{codePreview}</span>
              </div>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-coral-accent/30 bg-coral-accent/5 px-3 py-2 text-xs text-coral-accent">
                {error}
              </div>
            ) : null}
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
