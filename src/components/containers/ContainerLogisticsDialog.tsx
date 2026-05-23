import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Ship, X } from 'lucide-react'
import type { ContainerSchedule, LogisticsStatus } from '../../types/container'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import { formatDate } from '../../utils/dateHelpers'

interface ScheduleForm {
  carrierName: string
  pol: string
  pod: string
  lastCy: string
  etd: string
  eta: string
  transitTimeDays: string
}

const EMPTY_SCHEDULE_FORM: ScheduleForm = {
  carrierName: '',
  pol: '',
  pod: '',
  lastCy: '',
  etd: '',
  eta: '',
  transitTimeDays: '',
}

function toForm(schedule: ContainerSchedule | null): ScheduleForm {
  if (!schedule) return EMPTY_SCHEDULE_FORM
  return {
    carrierName: schedule.carrierName,
    pol: schedule.pol,
    pod: schedule.pod,
    lastCy: schedule.lastCy ?? '',
    etd: schedule.etd ?? '',
    eta: schedule.eta ?? '',
    transitTimeDays:
      schedule.transitTimeDays === null ? '' : String(schedule.transitTimeDays),
  }
}

function fromForm(form: ScheduleForm): ContainerSchedule {
  const tt = form.transitTimeDays.trim()
  return {
    carrierName: form.carrierName.trim(),
    pol: form.pol.trim(),
    pod: form.pod.trim(),
    lastCy: form.lastCy || null,
    etd: form.etd || null,
    eta: form.eta || null,
    transitTimeDays: tt === '' ? null : Number(tt),
  }
}

export default function ContainerLogisticsDialog() {
  const open = usePlannerStore((s) => s.logisticsDialog.open)
  const containerId = usePlannerStore((s) => s.logisticsDialog.containerId)
  const closeLogisticsDialog = usePlannerStore((s) => s.closeLogisticsDialog)
  const containers = usePlannerStore((s) => s.containers)
  const displayNameById = usePlannerStore((s) => s.displayNameById)
  const markContainerBooked = usePlannerStore((s) => s.markContainerBooked)
  const unmarkContainerBooked = usePlannerStore((s) => s.unmarkContainerBooked)
  const setContainerSchedule = usePlannerStore((s) => s.setContainerSchedule)
  const clearContainerSchedule = usePlannerStore((s) => s.clearContainerSchedule)
  const markContainerShipped = usePlannerStore((s) => s.markContainerShipped)
  const unmarkContainerShipped = usePlannerStore((s) => s.unmarkContainerShipped)
  const { user } = useAuth()

  const container = useMemo(
    () => containers.find((c) => c.id === containerId) ?? null,
    [containers, containerId],
  )

  const [form, setForm] = useState<ScheduleForm>(EMPTY_SCHEDULE_FORM)

  useEffect(() => {
    if (!open) return
    setForm(toForm(container?.schedule ?? null))
  }, [open, container?.schedule])

  const scheduleDirty = useMemo(() => {
    const current = toForm(container?.schedule ?? null)
    return (
      current.carrierName !== form.carrierName ||
      current.pol !== form.pol ||
      current.pod !== form.pod ||
      current.lastCy !== form.lastCy ||
      current.etd !== form.etd ||
      current.eta !== form.eta ||
      current.transitTimeDays !== form.transitTimeDays
    )
  }, [container?.schedule, form])

  const onOpenChange = (next: boolean) => {
    if (!next) closeLogisticsDialog()
  }

  if (!container) return null

  const stage: LogisticsStatus = container.logisticsStatus ?? 'committed'
  const canEdit = user.role === 'admin' || user.role === 'internal'

  const scheduleValid =
    form.carrierName.trim().length > 0 &&
    form.pol.trim().length > 0 &&
    form.pod.trim().length > 0

  const handleBook = () => void markContainerBooked(container.id, user.id)
  const handleUnbook = () => void unmarkContainerBooked(container.id)
  const handleSchedule = () => {
    if (!scheduleValid) return
    void setContainerSchedule(container.id, fromForm(form), user.id)
  }
  const handleUnschedule = () => void clearContainerSchedule(container.id)
  const handleShip = () => void markContainerShipped(container.id, user.id)
  const handleUnship = () => void unmarkContainerShipped(container.id)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg max-h-[90vh] overflow-auto -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-navy-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-200">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-navy-900">
              <Ship className="w-4 h-4 text-teal-accent" />
              Logistics — <span className="font-mono">{container.code}</span>
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-navy-400 hover:text-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="px-5 pt-3 text-[10px] font-mono uppercase tracking-widest text-navy-400">
            {container.name} · {container.type} · {container.destination}
            {container.ofqReference ? ` · ${container.ofqReference}` : ''}
          </Dialog.Description>

          <div className="p-5 space-y-4">
            <Section
              title="Booked"
              done={stage === 'booked' || stage === 'scheduled' || stage === 'shipped'}
              caption={
                container.bookedAt
                  ? `${formatDate(container.bookedAt)} · ${displayNameById(container.bookedBy)}`
                  : 'Carrier + rate picked'
              }
            >
              {canEdit ? (
                stage === 'committed' ? (
                  <PrimaryButton onClick={handleBook}>Mark booked</PrimaryButton>
                ) : stage === 'booked' ? (
                  <SecondaryButton onClick={handleUnbook}>Un-book</SecondaryButton>
                ) : null
              ) : null}
            </Section>

            <Section
              title="Scheduled"
              done={stage === 'scheduled' || stage === 'shipped'}
              dim={stage === 'committed'}
              caption={
                container.scheduledAt
                  ? `${formatDate(container.scheduledAt)} · ${displayNameById(container.scheduledBy)}`
                  : 'Carrier confirmed vessel; we accepted'
              }
            >
              {stage === 'committed' ? (
                <p className="text-[11px] italic text-navy-400">
                  Available after booking.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                    <Field label="Carrier">
                      <TextInput
                        value={form.carrierName}
                        onChange={(v) => setForm({ ...form, carrierName: v })}
                        readOnly={!canEdit}
                        placeholder="Hapag-Lloyd"
                      />
                    </Field>
                    <Field label="Transit (days)">
                      <TextInput
                        value={form.transitTimeDays}
                        onChange={(v) => setForm({ ...form, transitTimeDays: v })}
                        readOnly={!canEdit}
                        placeholder="7"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="POL">
                      <TextInput
                        value={form.pol}
                        onChange={(v) => setForm({ ...form, pol: v })}
                        readOnly={!canEdit}
                        placeholder="Cartagena"
                      />
                    </Field>
                    <Field label="POD">
                      <TextInput
                        value={form.pod}
                        onChange={(v) => setForm({ ...form, pod: v })}
                        readOnly={!canEdit}
                        placeholder="Miami"
                      />
                    </Field>
                    <Field label="Last CY">
                      <DateInput
                        value={form.lastCy}
                        onChange={(v) => setForm({ ...form, lastCy: v })}
                        readOnly={!canEdit}
                      />
                    </Field>
                    <Field label="ETD">
                      <DateInput
                        value={form.etd}
                        onChange={(v) => setForm({ ...form, etd: v })}
                        readOnly={!canEdit}
                      />
                    </Field>
                    <Field label="ETA">
                      <DateInput
                        value={form.eta}
                        onChange={(v) => setForm({ ...form, eta: v })}
                        readOnly={!canEdit}
                      />
                    </Field>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2 pt-3">
                      {stage === 'booked' ? (
                        <PrimaryButton
                          onClick={handleSchedule}
                          disabled={!scheduleValid}
                        >
                          Mark scheduled
                        </PrimaryButton>
                      ) : (
                        <>
                          <PrimaryButton
                            onClick={handleSchedule}
                            disabled={!scheduleValid || !scheduleDirty}
                          >
                            Save changes
                          </PrimaryButton>
                          {stage === 'scheduled' ? (
                            <SecondaryButton onClick={handleUnschedule}>
                              Un-schedule
                            </SecondaryButton>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </Section>

            <Section
              title="Shipped"
              done={stage === 'shipped'}
              dim={stage === 'committed' || stage === 'booked'}
              caption={
                container.shippedAt
                  ? `${formatDate(container.shippedAt)} · ${displayNameById(container.shippedBy)}`
                  : 'Shipping documents received'
              }
            >
              {canEdit ? (
                stage === 'scheduled' ? (
                  <PrimaryButton onClick={handleShip}>Mark shipped</PrimaryButton>
                ) : stage === 'shipped' ? (
                  <SecondaryButton onClick={handleUnship}>Un-ship</SecondaryButton>
                ) : null
              ) : null}
            </Section>
          </div>

          <div className="flex justify-end gap-2 px-5 py-3 border-t border-navy-100">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-600 hover:bg-navy-100 transition-colors"
              >
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Section({
  title,
  done,
  dim = false,
  caption,
  children,
}: {
  title: string
  done: boolean
  dim?: boolean
  caption: string
  children: ReactNode
}) {
  return (
    <section
      className={`rounded-xl border p-4 space-y-2 ${
        dim
          ? 'border-navy-100 bg-navy-50/40 opacity-60'
          : done
            ? 'border-teal-accent/30 bg-teal-accent/[0.03]'
            : 'border-amber-accent/40 bg-amber-accent/[0.03]'
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full border ${
              done
                ? 'bg-teal-accent border-teal-accent'
                : 'bg-transparent border-navy-300'
            }`}
          />
          <h4 className="text-sm font-semibold text-navy-900">{title}</h4>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-navy-400 text-right">
          {caption}
        </span>
      </header>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-mono uppercase tracking-widest text-navy-400 mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  readOnly,
  placeholder,
  inputMode,
}: {
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  placeholder?: string
  inputMode?: 'numeric' | 'text'
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
      inputMode={inputMode}
      className="w-full px-2.5 py-1.5 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent read-only:bg-navy-100 read-only:text-navy-500"
    />
  )
}

function DateInput({
  value,
  onChange,
  readOnly,
}: {
  value: string
  onChange: (v: string) => void
  readOnly: boolean
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      className="w-full px-2.5 py-1.5 rounded-lg border border-navy-200 bg-navy-50 text-sm text-navy-900 focus:outline-none focus:border-amber-accent read-only:bg-navy-100 read-only:text-navy-500"
    />
  )
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-600 border border-navy-200 hover:border-coral-accent hover:text-coral-accent transition-colors"
    >
      {children}
    </button>
  )
}
