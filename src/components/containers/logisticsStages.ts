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
  STALENESS — the reason stage segmentation is worth building at all.

  The count of containers at each stage is not the interesting number. The interesting number is
  HOW LONG they have been sitting there. Booking and scheduling are done by other people, and
  the whole point of seeing the pipeline is to find the ones nobody has moved — so somebody can
  be chased, or a forwarder who cannot make the window can be swapped out before it costs a
  sailing.

  So everything below is about age, not volume.
  ─────────────────────────────────────────────────────────────────────────────
*/

const DAY_MS = 86_400_000

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

/**
 * Days past which a wait at each stage is worth asking about.
 *
 * ONE NUMBER PER STAGE, not one overall. Waiting on a booking is not the same as waiting on a
 * vessel: a single threshold either calls a four-day booking gap fine, or flags a seven-day wait
 * for a departure that may be entirely normal. Both errors send someone chasing the wrong thing.
 *
 * STARTING GUESSES. They live here, together, so they can be moved once the real rhythms are
 * known — which is the only way anyone will find out what these should be.
 *
 * `shipped` is Infinity rather than a large number: it cannot go stale by definition, and saying
 * so in the type is better than choosing a figure nobody will ever reach.
 */
export const STALE_AFTER_DAYS: Record<LogisticsStatus, number> = {
  committed: 3,
  booked: 7,
  scheduled: 14,
  shipped: Infinity,
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

/** Whole days waiting at the current stage; null when the stamp is missing. */
export function daysInStage(c: Parameters<typeof stageEnteredAt>[0]): number | null {
  const at = stageEnteredAt(c)
  if (!at) return null
  return Math.floor((Date.now() - new Date(at).getTime()) / DAY_MS)
}

/**
 * Waiting long enough to be worth a phone call, judged against this stage's own patience.
 *
 * SHIPPED IS NEVER STALE. It is the end of the line — a container that sailed three months ago
 * is finished, not neglected, and flagging it would bury the ones that actually need chasing
 * under a growing pile of completed work. The Infinity threshold makes that fall out rather
 * than needing a special case.
 */
export function isStalled(c: Parameters<typeof stageEnteredAt>[0]): boolean {
  const days = daysInStage(c)
  return days !== null && days >= STALE_AFTER_DAYS[stageOf(c.logisticsStatus)]
}

/**
 * What this container is waiting for and how long — the single call a card makes.
 *
 * Returns null when there is nothing to say, which folds three separate "should this show?"
 * questions into one place rather than leaving them scattered through JSX:
 *
 *   · nothing is owed        shipped, or a draft with no stamps at all
 *   · nothing is knowable    the stamp is missing
 *   · nothing has happened   less than a day, and nobody could reasonably have acted yet.
 *                            "0d awaiting booking" on something committed this morning is a
 *                            reproach for not having done the impossible.
 */
export function waitOf(
  c: Parameters<typeof stageEnteredAt>[0],
): { days: number; label: string; stalled: boolean } | null {
  const label = AWAITING_LABELS[stageOf(c.logisticsStatus)]
  if (!label) return null

  const days = daysInStage(c)
  if (days === null || days < 1) return null

  return { days, label, stalled: isStalled(c) }
}
