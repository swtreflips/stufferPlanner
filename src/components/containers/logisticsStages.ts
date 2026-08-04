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

/**
 * WHAT EACH STAGE IS WAITING FOR.
 *
 * The stage name says where a container is; this says what has not happened yet. That is the
 * more useful half on a card, because the status badge already covers the first — and "awaiting
 * schedule" is the sentence you would actually say when ringing the forwarder.
 *
 * `shipped` is null: it is the end of the chain and owes nothing.
 */
export const AWAITING_LABELS: Record<LogisticsStatus, string | null> = {
  committed: 'awaiting booking',
  booked: 'awaiting schedule',
  scheduled: 'awaiting departure',
  shipped: null,
}

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
 * What this container is waiting for, and how long it has been waiting.
 *
 * Null only when there is genuinely nothing to say: the stage owes nothing (shipped, or a
 * draft), or the stamp that would date it is missing.
 *
 * The age is a formatted string rather than a number because there is no threshold to compare
 * against — nothing downstream needs to decide whether it is "too long", only to show it and to
 * sort by it, and sorting uses `msInStage` directly.
 */
export function waitOf(
  c: Parameters<typeof stageEnteredAt>[0],
): { age: string; label: string } | null {
  const label = AWAITING_LABELS[stageOf(c.logisticsStatus)]
  if (!label) return null

  const ms = msInStage(c)
  if (ms === null) return null

  return { age: formatStageAge(ms), label }
}
