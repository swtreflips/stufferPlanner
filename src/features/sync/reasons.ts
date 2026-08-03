import type { ClosedReason, ConfirmedReason } from '../../types/sync'

/**
 * How each closure reason is worded, in one place.
 *
 * Two forms per reason, and the split is the point. `likely` is used wherever the value came
 * from `closed_reason_inferred` — the sync's guess — and `plain` wherever a person confirmed it.
 * The database keeps those in separate columns precisely so this distinction survives to the
 * screen; wording them identically here would throw that away at the last step, and a guess
 * quoted without hedging is how "cancelled" becomes something people repeat as fact.
 *
 * `why` explains the evidence, shown on hover, because "likely withdrawn" is only meaningful if
 * you know what the system saw.
 */
export const REASON_LABELS: Record<
  ClosedReason | ConfirmedReason,
  { plain: string; likely: string; why: string }
> = {
  fulfilled: {
    plain: 'Fulfilled',
    likely: 'likely fulfilled',
    why: 'Nothing left available when it dropped out — the quantity had run down to zero.',
  },
  cancelled: {
    plain: 'Cancelled',
    likely: 'likely cancelled',
    why: 'Part of it had shipped, then the rest disappeared rather than completing.',
  },
  withdrawn: {
    plain: 'Withdrawn',
    likely: 'likely withdrawn',
    why: 'Appeared in one export, never shipped a case, and was gone by the next — the shape of a line entered by mistake and removed.',
  },
  unknown: {
    plain: 'Unknown',
    likely: 'with no clear reason',
    why: 'It simply stopped appearing, with quantity still open and no shipments against it. The export does not say why.',
  },
  other: {
    plain: 'Other',
    likely: 'other',
    why: 'Recorded by hand — see the note.',
  },
}

/** What a person may choose. `unknown` is missing on purpose: confirming is stating what you know. */
export const CONFIRMABLE: ConfirmedReason[] = [
  'fulfilled',
  'cancelled',
  'withdrawn',
  'other',
]
