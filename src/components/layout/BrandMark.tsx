import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * The app's identity lockup — icon slot and wordmark.
 *
 * ONE STRUCTURE ACROSS THE ESTATE. Freight, Schedules and Planner carry the same two parts in the
 * same proportions and differ only in their own accent. Adding a fourth app should mean copying
 * this file, not designing a header.
 *
 * ── Why the wordmark is set in Fraunces and the interface is not ──────────────────────────────
 * A logotype wants a face the interface does not use — Adobe Clean, Google Sans and Atlassian's
 * Charlie all exist for this reason. Set in the UI face at UI weight, a name reads as a label; the
 * mark here did, which is why it looked raw. Fraunces is a soft serif with real SOFT and WONK
 * axes, built to feel hand-cut, and it holds that warmth down to 16px.
 *
 * OPTICAL SIZING IS THE BROWSER'S JOB. The font is requested with `opsz` as a range, so it stays
 * variable and `font-optical-sizing: auto` — the default — picks the right optical size on its
 * own. Setting `font-variation-settings` here would silently switch that off. Weight and SOFT are
 * pinned in the request instead.
 *
 * ── The slot ─────────────────────────────────────────────────────────────────────────────────
 * A soft wash of the app's own accent, no shadow, generous radius. A solid fill with a drop shadow
 * is the iOS app-chip convention and would fight a painted illustration; a wash reads as ground
 * rather than as a container.
 *
 * ── The monogram ─────────────────────────────────────────────────────────────────────────────
 * Until real icons exist the slot shows the app's initial in the logotype face, so the reserved
 * space reads as a mark rather than a gap. Pass `icon` and it disappears.
 *
 * This replaced the Prime Time Packaging logo that used to sit here — a COMPANY mark in the slot
 * every other app uses for the MODULE. The logo still carries the Settings page.
 */

export const APP_NAME = 'Planner'
/** Not rendered in the lockup any more; still the module's description, used for titles. */
export const APP_DESCRIPTOR = 'Container Loading'

interface Props {
  /** Fills the slot and replaces the monogram. */
  icon?: ReactNode
  /** When set, the lockup links home. */
  to?: string
  className?: string
}

export function BrandMark({ icon = null, to, className = '' }: Props) {
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-amber-accent/8">
        {icon ?? (
          <span
            aria-hidden="true"
            className="font-logo text-[15px] font-medium leading-none text-amber-accent-strong"
          >
            {APP_NAME.charAt(0)}
          </span>
        )}
      </span>

      <span className="font-logo text-base font-medium leading-none tracking-[-0.005em] text-navy-900">
        {APP_NAME}
        <span className="text-amber-accent">.</span>
      </span>
    </>
  )

  const shell = `flex items-center gap-2.5 overflow-hidden ${className}`

  if (!to) return <div className={shell}>{inner}</div>

  return (
    <Link to={to} aria-label={`${APP_NAME} — home`} className={shell}>
      {inner}
    </Link>
  )
}
