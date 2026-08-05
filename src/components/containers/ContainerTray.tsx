import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Container, LogisticsStatus } from '../../types/container'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import ContainerCard from './ContainerCard'
import AddContainerDialog from './AddContainerDialog'
import { CONTAINER_COL, LINE_GRID, LINE_COLUMNS } from './allocationColumns'
import { nextContainerName } from './containerNaming'
import {
  STAGES,
  STAGE_LABELS,
  formatStageAge,
  msInStage,
  stageOf,
} from './logisticsStages'
import TrayControls, {
  type StageStat,
  type TrayCounts,
  type TrayView,
} from './TrayControls'

interface SupplierGroup {
  supplierId: string
  supplierName: string
  containers: Container[]
}

export default function ContainerTray() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const containers = usePlannerStore((s) => s.containers)
  const suppliers = usePlannerStore((s) => s.suppliers)
  const supplierFilterId = usePlannerStore((s) => s.supplierFilterId)
  const { user } = useAuth()
  const isInternal = user.role === 'internal' || user.role === 'admin'

  /*
    Which slice of the pipeline is on screen. Local state, not the store and not persisted — the
    same call as `showClosed` in the grid: a way of looking at the board rather than a fact about
    it. Opens on `all`, so a container is never missing because of a filter someone forgot.
  */
  const [view, setView] = useState<TrayView>('all')
  const [stage, setStage] = useState<LogisticsStatus | null>(null)

  // The supplier focus from the header, applied once and reused by the counts, the summary and
  // the cards — so the totals cannot describe a different set from what is rendered.
  const scoped = useMemo(
    () =>
      supplierFilterId
        ? containers.filter((c) => c.supplierId === supplierFilterId)
        : containers,
    [containers, supplierFilterId],
  )

  // Containers and drafts follow the same focus filter as the grid, for every role. The old
  // code pinned factory users to their own supplierId, which hid a sibling plant's drafts from
  // someone entitled to see them — see the note in OpenPoStatusReport. RLS scopes the rows;
  // this only decides which of those the user is currently looking at.
  const supplierName = (id: string) =>
    suppliers.find((s) => s.id === id)?.name ?? id

  /*
    Ordered the same way as the PO grid on the right: supplier, then destination. The two panes
    are read together — you drag from one into the other — so a container ordered differently
    from the lines that can go into it makes you search rather than scan.

    Internal sorts by supplier first; external has one supplier per view (the plant dropdown
    guarantees it), so that key is constant and destination leads on its own. Same rule as the
    grid, degenerating the same way, rather than a second rule that could drift from it.

    displayOrder remains the final tiebreak, so two containers to the same destination keep the
    order they were created in instead of shuffling on every render.
  */
  const { committed, drafts } = useMemo(() => {
    const sorted = [...scoped].sort((a, b) =>
      (isInternal ? supplierName(a.supplierId).localeCompare(supplierName(b.supplierId)) : 0)
      || a.destination.localeCompare(b.destination)
      || a.displayOrder - b.displayOrder,
    )
    return {
      committed: sorted.filter((c) => c.status === 'committed'),
      drafts: sorted.filter((c) => c.status === 'draft'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, suppliers, isInternal])

  /*
    PER-STAGE STATS — counts, and how long the worst one has waited.

    The age is what makes this worth showing. Booking and scheduling are done by other people, so
    the question is not "how many are booked" but "which of these has nobody touched" — that is
    the one to chase a forwarder about, or take off them. No threshold decides that; the age is
    shown and the stage sorts by it, so the worst is simply at the top.
  */
  const counts: TrayCounts = useMemo(() => {
    const byStage = Object.fromEntries(
      STAGES.map((s) => {
        const inStage = committed.filter((c) => stageOf(c.logisticsStatus) === s)
        const ages = inStage.map((c) => msInStage(c)).filter((v): v is number => v !== null)
        return [
          s,
          {
            count: inStage.length,
            oldestAge: ages.length ? formatStageAge(Math.max(...ages)) : null,
          },
        ]
      }),
    ) as Record<LogisticsStatus, StageStat>

    return {
      all: committed.length + drafts.length,
      drafts: drafts.length,
      committed: committed.length,
      byStage,
    }
  }, [committed, drafts])

  /*
    WHAT IS ON SCREEN, after both filters. The supplier focus has already been applied above, so
    this composes with it rather than re-deriving it — one definition of "scoped", one of "in
    view", and no second copy free to disagree with the cards.
  */
  const visibleCommitted = useMemo(() => {
    if (view === 'drafts') return []
    if (view !== 'committed' || stage === null) return committed
    // Longest-waiting first: the point of opening a stage is to act on whatever has been sitting
    // there, and the thing to act on should not be somewhere in the middle of the list.
    return committed
      .filter((c) => stageOf(c.logisticsStatus) === stage)
      .sort((a, b) => (msInStage(b) ?? -1) - (msInStage(a) ?? -1))
  }, [committed, view, stage])

  const visibleDrafts = view === 'committed' ? [] : drafts

  const visibleCount = visibleCommitted.length + visibleDrafts.length

  // Cluster by supplier inside each section, with small labels between groups. This used to be
  // "admin/internal only", on the assumption that a factory sees exactly one supplier. Junsun
  // breaks that: two plants, one login. The label is now driven by the DATA — shown whenever
  // the visible set spans more than one supplier — so a Junsun user can tell Thailand from
  // Qingdao, and a single-plant factory is unchanged.
  const groupBySupplier = (list: Container[]): SupplierGroup[] => {
    const bySupplier = new Map<string, Container[]>()
    for (const c of list) {
      const existing = bySupplier.get(c.supplierId)
      if (existing) existing.push(c)
      else bySupplier.set(c.supplierId, [c])
    }
    return Array.from(bySupplier.entries())
      .map(([supplierId, group]) => ({
        supplierId,
        supplierName:
          suppliers.find((s) => s.id === supplierId)?.name ?? supplierId,
        containers: group,
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName))
  }

  const renderGroups = (list: Container[]) => {
    if (new Set(list.map((c) => c.supplierId)).size <= 1) {
      return list.map((c) => <ContainerCard key={c.id} container={c} />)
    }
    return groupBySupplier(list).map((group) => (
      <div key={group.supplierId} className="space-y-3">
        <SupplierLabel name={group.supplierName} />
        {group.containers.map((c) => (
          <ContainerCard key={c.id} container={c} />
        ))}
      </div>
    ))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Global column header — a 40px band that lines up with the master grid header on the
          right and labels the container-card columns. LIGHT, not dark: a column header is
          content furniture, and dark is reserved for global navigation chrome. Matching the
          grid beside it is the whole reason this band exists. See OS/DESIGN.md, "What dark
          means". */}
      <div className="h-10 shrink-0 flex items-center bg-navy-50 border-b border-navy-200">
        <div className="flex items-center w-full px-3">
          <div
            className={`${CONTAINER_COL} shrink-0 text-[10px] font-mono uppercase tracking-widest text-navy-500`}
          >
            Container
          </div>
          <div className="flex-1 min-w-0">
            <div className={`${LINE_GRID} px-2`}>
              {LINE_COLUMNS.map((c) => (
                <span
                  key={c.key}
                  className={`text-[10px] font-mono uppercase tracking-widest text-navy-500 truncate ${
                    c.align === 'right' ? 'text-right' : ''
                  } ${c.key === 'quantity' ? 'pr-3' : ''}`}
                >
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto px-3 py-3 space-y-3"
        style={{ scrollbarGutter: 'stable' }}
      >
        {visibleCommitted.length === 0 && visibleDrafts.length === 0 ? (
          <EmptyState
            view={view}
            stage={stage}
            anyExist={counts.all > 0}
            onClear={() => {
              setView('all')
              setStage(null)
            }}
          />
        ) : (
          <>
            {/* Headings only when both kinds are on screen. Under a single view the control in
                the footer already says what you are looking at, and repeating it is furniture. */}
            {visibleCommitted.length > 0 ? (
              <Section label={view === 'all' ? 'Committed (OFQs)' : null}>
                <div className="space-y-3">{renderGroups(visibleCommitted)}</div>
              </Section>
            ) : null}
            {visibleDrafts.length > 0 ? (
              <Section label={view === 'all' ? 'Drafts' : null}>
                <div className="space-y-3">{renderGroups(visibleDrafts)}</div>
              </Section>
            ) : null}
          </>
        )}
      </div>

      <div className="border-t border-navy-200 px-3 py-2.5 bg-white space-y-2">
        <TrayControls
          view={view}
          onViewChange={(v) => {
            setView(v)
            // The stage filter belongs to Committed. Carrying it into another view would leave a
            // narrowing in force that is no longer visible anywhere.
            if (v !== 'committed') setStage(null)
          }}
          stage={stage}
          onStageChange={setStage}
          counts={counts}
          visibleCount={visibleCount}
          scopeLabel={supplierFilterId ? supplierName(supplierFilterId) : null}
        />
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-navy-300 hover:border-amber-accent text-navy-500 hover:text-amber-accent text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add container
        </button>
      </div>

      <AddContainerDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next)
          // Creating while filtered to Committed would put a new draft somewhere you cannot see,
          // which reads as the button having failed. Closing the dialog returns to a view that
          // shows drafts.
          if (!next && view === 'committed') {
            setView('all')
            setStage(null)
          }
        }}
        defaultName={nextContainerName(containers)}
      />
    </div>
  )
}

function Section({
  label,
  children,
}: {
  label: string | null
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      {label ? (
        <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400 px-1">
          {label}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function SupplierLabel({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span className="h-px flex-1 bg-navy-200" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-navy-500">
        {name}
      </span>
      <span className="h-px flex-1 bg-navy-200" />
    </div>
  )
}

/**
 * Empty, and WHY it is empty.
 *
 * "No containers yet" is simply wrong when six exist and none are shipped — it says the board is
 * bare when the truth is that a filter is on. Each view says its own thing, and anything other
 * than a genuinely empty board offers the way back.
 */
function EmptyState({
  view,
  stage,
  anyExist,
  onClear,
}: {
  view: TrayView
  stage: LogisticsStatus | null
  anyExist: boolean
  onClear: () => void
}) {
  const filtered = anyExist
  const title = !filtered
    ? 'No containers yet'
    : stage
      ? `Nothing ${STAGE_LABELS[stage].toLowerCase()}`
      : view === 'drafts'
        ? 'No drafts'
        : view === 'committed'
          ? 'Nothing committed'
          : 'No containers yet'

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 pt-12 text-navy-400">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-navy-300">
        <span className="font-mono text-2xl font-bold text-navy-100">+</span>
      </div>
      <div className="max-w-xs text-center">
        <div className="text-sm font-semibold uppercase tracking-wide text-navy-500">{title}</div>
        <div className="mt-1 text-xs text-navy-400">
          {filtered ? (
            <>
              Nothing here under this filter.{' '}
              <button
                type="button"
                onClick={onClear}
                className="font-semibold text-amber-accent underline-offset-2 hover:underline"
              >
                Show all
              </button>
            </>
          ) : (
            <>
              Click <span className="font-mono">Add container</span> to start building an OFQ.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
