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
 * Days past which a container waiting at a stage is worth asking about.
 *
 * A STARTING GUESS, deliberately one number in one place so it can be moved once real waiting
 * times are known. Booking usually follows a commitment within days; a week of silence is the
 * point at which it is fair to assume nobody is acting rather than that it is simply early.
 */
export const STALE_AFTER_DAYS = 7

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
 * Waiting long enough to be worth a phone call.
 *
 * SHIPPED IS NEVER STALE. It is the end of the line — a container that sailed three months ago
 * is finished, not neglected, and flagging it would bury the ones that actually need chasing
 * under a growing pile of completed work.
 */
export function isStalled(c: Parameters<typeof stageEnteredAt>[0]): boolean {
  if (stageOf(c.logisticsStatus) === 'shipped') return false
  const days = daysInStage(c)
  return days !== null && days >= STALE_AFTER_DAYS
}
