import type { LogisticsStatus } from '../../types/container'
import { STAGE_LABELS, STAGES } from './logisticsStages'

/**
 * The tray's status filter, stage filter and totals — one control, in the footer.
 *
 * WHY THESE ARE ONE THING. A committed container is a decision already made; a draft is
 * planning. Those are different truths and deserve to be looked at separately. But drafts and
 * the four committed stages are not two axes — they are one ordered pipeline:
 *
 *     draft → committed → booked → scheduled → shipped
 *
 * So the summary and the filter are the same object. The numbers you would read are the buttons
 * you would press, which is why there is no separate "totals" panel anywhere.
 *
 * WHY THE FOOTER. The tray's 40px column band exists to line up with the master grid's header in
 * the right pane, and a filter bar above it would push it out of register. The footer already
 * carried `3 committed · 4 drafts`; those numbers simply were not clickable. This replaces that
 * line, adds no new chrome, and keeps status, totals and Add container in one block that never
 * scrolls away.
 *
 * Presentational only — every number is handed in, so there is one place (ContainerTray) that
 * decides what "in view" means and no chance of this disagreeing with the cards above it.
 */

export type TrayView = 'all' | 'drafts' | 'committed'

/** Per-stage: how many are sitting there, and how long the worst one has been. */
export interface StageStat {
  count: number
  /** Formatted age of the longest-waiting container here — "4h", "1d 4h", "6d". */
  oldestAge: string | null
}

export interface TrayCounts {
  all: number
  drafts: number
  committed: number
  byStage: Record<LogisticsStatus, StageStat>
}

export default function TrayControls({
  view,
  onViewChange,
  stage,
  onStageChange,
  counts,
  visibleCount,
  scopeLabel,
}: {
  view: TrayView
  onViewChange: (v: TrayView) => void
  stage: LogisticsStatus | null
  onStageChange: (s: LogisticsStatus | null) => void
  counts: TrayCounts
  /** Containers actually on screen — differs from the segment counts once a stage is picked. */
  visibleCount: number
  /** Supplier the header filter is focused on, if any — so the count says what it covers. */
  scopeLabel: string | null
}) {
  return (
    <div className="space-y-2">
      {/*
        Committed first, then Drafts, then All — read in the order the work is, not the order the
        sets nest in. Committed containers are decisions already made with a clock running on
        them; drafts are the working state; All is the fallback for seeing everything at once.
        Leading with the widest option put the least urgent thing first.
      */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-navy-200">
        <Segment
          label="Committed"
          count={counts.committed}
          active={view === 'committed'}
          onClick={() => onViewChange('committed')}
        />
        <Segment
          label="Drafts"
          count={counts.drafts}
          active={view === 'drafts'}
          onClick={() => onViewChange('drafts')}
        />
        <Segment
          label="All"
          count={counts.all}
          active={view === 'all'}
          onClick={() => onViewChange('all')}
          last
        />
      </div>

      {/*
        Stages appear ONLY under Committed. Committed is a universe and the stages subdivide it,
        so nesting them says that. Offering them under All would mean picking "booked" silently
        excluded every draft — a filter doing something it never said it would.
      */}
      {view === 'committed' ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {STAGES.map((s) => (
            <StageChip
              key={s}
              label={STAGE_LABELS[s]}
              stat={counts.byStage[s]}
              active={stage === s}
              onClick={() => onStageChange(stage === s ? null : s)}
            />
          ))}
        </div>
      ) : null}

      {/*
        THE SEGMENTS ARE THE SUMMARY. Counts of committed and of drafts is the whole ask, and
        those numbers are already on the buttons — a line underneath repeating "5 containers"
        while the ALL segment says 5 is furniture.

        So this row appears only when it can say something the segments cannot: which supplier
        every number above is scoped to, and how many remain once a STAGE narrows below the
        Committed count.

        Counted in containers, never cases. A container is the unit of decision here — one
        container is one OFQ, one booking, one thing to chase. Case totals live on the cards,
        attached to the lines that carry them.
      */}
      {scopeLabel || stage ? (
        <div className="text-center font-mono text-[10px] uppercase tracking-widest text-navy-400">
          {scopeLabel ? <span className="text-navy-500">{scopeLabel}</span> : null}
          {scopeLabel && stage ? ' · ' : null}
          {stage ? `${visibleCount} ${visibleCount === 1 ? 'container' : 'containers'}` : null}
        </div>
      ) : null}
    </div>
  )
}

function Segment({
  label,
  count,
  active,
  onClick,
  last = false,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex-1 px-2 py-1.5 transition-colors',
        last ? '' : 'border-r border-navy-200',
        active ? 'bg-navy-900 text-navy-50' : 'bg-white text-navy-600 hover:bg-navy-100',
      ].join(' ')}
    >
      <span className="block font-mono text-[10px] uppercase tracking-widest">{label}</span>
      <span
        className={`block text-sm font-bold tabular-nums ${active ? 'text-navy-50' : 'text-navy-900'}`}
      >
        {count}
      </span>
    </button>
  )
}

/**
 * One stage: how many are sitting there, and how long the worst one has been.
 *
 * THE AGE IS THE POINT, not the count. Booking and scheduling are somebody else's move, so the
 * question this row answers is "who has stopped" — three booked containers might all be from
 * yesterday, or one of them might have been sitting for a week, and the count cannot tell them
 * apart.
 *
 * No threshold and no alarm colour. This is a funnel; every stage wants emptying as fast as it
 * can be, so there is no age at which something becomes fine. Selecting the stage sorts by age
 * and puts the worst on top, which needs no one to agree where "late" starts.
 *
 * A stage with nothing in it stays VISIBLE, because "nothing shipped yet" is a real answer and
 * hiding it would make the pipeline look shorter than it is. It is UNCLICKABLE, because the only
 * thing it could do is empty the tray.
 */
function StageChip({
  label,
  stat,
  active,
  onClick,
}: {
  label: string
  stat: StageStat
  active: boolean
  onClick: () => void
}) {
  const empty = stat.count === 0

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      aria-pressed={active}
      title={empty ? `Nothing ${label.toLowerCase()} yet` : `Longest here: ${stat.oldestAge}`}
      className={[
        'flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors',
        empty
          ? 'cursor-default text-navy-300'
          : active
            ? 'bg-navy-900 text-navy-50'
            : 'text-navy-500 hover:bg-navy-100 hover:text-navy-800',
      ].join(' ')}
    >
      <span
        className={[
          'h-2 w-2 shrink-0 rounded-full border',
          empty
            ? 'border-navy-200 bg-transparent'
            : active
              ? 'border-navy-50 bg-navy-50'
              : 'border-navy-300 bg-transparent',
        ].join(' ')}
      />
      <span className="truncate">{label}</span>
      <span className="ml-auto flex items-baseline gap-1 tabular-nums">
        {!empty && stat.oldestAge ? (
          <span className={active ? 'text-navy-300' : 'text-navy-400'}>{stat.oldestAge}</span>
        ) : null}
        <span className="font-bold">{stat.count}</span>
      </span>
    </button>
  )
}
