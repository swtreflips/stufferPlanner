import type { ReactNode } from 'react'

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

const SIZES = {
  sm: { slot: 'h-9 w-9 rounded-2xl', gap: 'gap-2.5', name: 'text-base', monogram: 'text-[15px]' },
  lg: { slot: 'h-12 w-12 rounded-[1.15rem]', gap: 'gap-3', name: 'text-3xl', monogram: 'text-xl' },
} as const

/*
  Two tones, because the mark lives on two grounds. They are not the same colours dimmed: on light
  the monogram needs `accent-strong` to clear 4.5:1 against its own wash, and on dark it needs
  `accent-light`, because the mid green reads too close to an earth ground. Opposite ends of the
  same ramp.
*/
const TONES = {
  light: { wash: 'bg-amber-accent/8', monogram: 'text-amber-accent-strong', name: 'text-navy-900', dot: 'text-amber-accent' },
  dark: { wash: 'bg-amber-accent-light/15', monogram: 'text-amber-accent-light', name: 'text-white', dot: 'text-amber-accent-light' },
} as const

interface Props {
  /** Fills the slot and replaces the monogram. */
  icon?: ReactNode
  size?: keyof typeof SIZES
  tone?: keyof typeof TONES
  className?: string
}

/*
  THE LOCKUP IS A MARK, NOT A CONTROL.

  It used to be a link home. That made it clickable here and in Freight while Schedules — a single
  screen with no router — stayed plain text, so the cursor told three different stories: a hand in
  two apps and a text I-beam in the third. A logo only earns a link when there is somewhere to go.

  `select-none` matters as much as the cursor: dragging across a wordmark and highlighting it is
  the tell that something is text rather than a mark.
*/

export function BrandMark({ icon = null, size = 'sm', tone = 'light', className = '' }: Props) {
  const s = SIZES[size]
  const t = TONES[tone]

  return (
    <div
      className={`flex cursor-default select-none items-center ${s.gap} overflow-hidden ${className}`}
    >
      <span className={`flex shrink-0 items-center justify-center overflow-hidden ${s.slot} ${t.wash}`}>
        {icon ?? (
          <span
            aria-hidden="true"
            className={`font-logo font-medium leading-none ${s.monogram} ${t.monogram}`}
          >
            {APP_NAME.charAt(0)}
          </span>
        )}
      </span>

      <span className={`font-logo font-medium leading-none tracking-[-0.005em] ${s.name} ${t.name}`}>
        {APP_NAME}
        <span className={t.dot}>.</span>
      </span>
    </div>
  )
}
