import type { LogisticsStatus } from '../../types/container'

/**
 * The post-commit lifecycle, in order, with its labels.
 *
 * Extracted so the container card's progress pills and the tray's stage filter agree on what
 * the stages are and what they are called. They were about to be declared twice — and a stage
 * added later to one list but not the other would show a container in a state the filter could
 * not find, which is exactly the kind of divergence that only surfaces in front of a customer.
 *
 * ORDER IS MEANING here, not presentation. `committed` → `booked` → `scheduled` → `shipped` is
 * the sequence the database's lifecycle RPCs enforce, and the card's "what is owed next" hint
 * is derived from position in this array.
 */
export const STAGES: LogisticsStatus[] = ['committed', 'booked', 'scheduled', 'shipped']

export const STAGE_LABELS: Record<LogisticsStatus, string> = {
  committed: 'Committed',
  booked: 'Booked',
  scheduled: 'Scheduled',
  shipped: 'Shipped',
}

/**
 * The stages a card shows as PROGRESS, which is the three that can still be owed.
 *
 * `committed` is excluded: every committed container is already committed, so a pill for it
 * would be permanently filled and say nothing.
 */
export const PROGRESS_STAGES: LogisticsStatus[] = ['booked', 'scheduled', 'shipped']

/** A container's stage, defaulting a committed row with no logistics status yet. */
export const stageOf = (logisticsStatus: LogisticsStatus | null): LogisticsStatus =>
  logisticsStatus ?? 'committed'

/*
  ─────────────────────────────────────────────────────────────────────────────
  AGE IN THE CURRENT STAGE — the reason stage segmentation is worth building.

  The count of containers at each stage is not the interesting number. How long they have been
  sitting there is. Booking and scheduling are somebody else's move, so the point of seeing the
  pipeline is to find what has stopped — to chase whoever is holding it, or take the freight off
  a forwarder who cannot make the window.

  THERE IS NO THRESHOLD, DELIBERATELY. This is a funnel and the job is to empty it as fast as
  possible; there is no number of days that is "fine". A cliff at seven days would say a
  six-day-old container needs nothing, and — worse — a colour that only appears past an arbitrary
  line is a colour people learn to wait for and then ignore. The age itself is the signal:
  longer is worse, continuously, and sorting a stage by it puts the worst at the top without
  anyone having to agree on where "late" begins.
  ─────────────────────────────────────────────────────────────────────────────
*/

const HOUR_MS = 3_600_000

/** When the container entered the stage it is currently in. */
export function stageEnteredAt(c: {
  logisticsStatus: LogisticsStatus | null
  committedAt: string | null
  bookedAt: string | null
  scheduledAt: string | null
  shippedAt: string | null
}): string | null {
  switch (stageOf(c.logisticsStatus)) {
    case 'shipped':
      return c.shippedAt
    case 'scheduled':
      return c.scheduledAt
    case 'booked':
      return c.bookedAt
    default:
      return c.committedAt
  }
}

/** Milliseconds waiting at the current stage; null when the stamp is missing. */
export function msInStage(c: Parameters<typeof stageEnteredAt>[0]): number | null {
  const at = stageEnteredAt(c)
  if (!at) return null
  return Math.max(0, Date.now() - new Date(at).getTime())
}

/**
 * "4h" · "1d 4h" · "6d" — the age, at the resolution it is actually read at.
 *
 * HOURS MATTER on the first day and stop mattering after it. A container booked this morning is
 * not the same as one booked last night, and rounding both to "0d" threw away the only
 * difference there was; but nobody chasing a six-day-old booking cares that it is six days and
 * eleven hours. So hours show until there is a day, then alongside it, and drop out once they
 * are zero.
 */
export function formatStageAge(ms: number): string {
  const totalHours = Math.floor(ms / HOUR_MS)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (days === 0) return `${totalHours}h`
  if (hours === 0) return `${days}d`
  return `${days}d ${hours}h`
}

/**
 * How long this container has been sitting in the phase it is currently in.
 *
 * NAMES THE PHASE IT IS IN, not the one it is waiting for. This first read "8h awaiting
 * booking" — describing the next step rather than the current state, which meant the card and
 * the tray chips were labelling the same container two different ways, and the age appeared to
 * belong to something that had not happened yet. "8h committed" is the plain reading: this is
 * where it is, and this is how long it has been there.
 *
 * Null when there is no phase to time. A draft has no stamps, and SHIPPED has left the funnel —
 * there is no next step to reach, so an age there measures nothing anyone is going to act on.
 *
 * The age is a formatted string because nothing downstream compares it against anything. There
 * is no threshold; sorting uses `msInStage` directly.
 */
export function waitOf(
  c: Parameters<typeof stageEnteredAt>[0],
): { age: string; label: string } | null {
  const stage = stageOf(c.logisticsStatus)
  if (stage === 'shipped') return null

  const ms = msInStage(c)
  if (ms === null) return null

  return { age: formatStageAge(ms), label: STAGE_LABELS[stage] }
}
