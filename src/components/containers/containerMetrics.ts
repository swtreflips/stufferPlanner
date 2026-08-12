import type { Allocation } from '../../types/allocation'
import type { Container } from '../../types/container'
import type { MasterItem } from '../../types/masterItem'

/*
  What is in a container, computed once.

  This existed three times — ContainerCard, CommitConfirmDialog and (via its caller) the capacity
  bar each summed `cbmPerCase * quantity` in their own loop. Three copies of arithmetic nobody
  disputes looks harmless right up to the point where one of them is read out loud.

  The export is what forced the issue: a document stating a fill percentage the card does not show
  is worse than no document, because it gets emailed. So the report, the card and the commit dialog
  now share this, and cannot disagree about how full a box is.
*/

export interface ContainerTotals {
  /** Allocation rows, not cases — "3 lines" reads as three PO lines. */
  lines: number
  cases: number
  cbm: number
  /** null when the type has no configured capacity, so callers can hide the bar rather than divide by zero. */
  fillPct: number | null
  /**
   * The LATEST cargo-ready date across the contents — the container cannot leave before its
   * slowest line is ready, so the max is the operative date, not the min.
   */
  latestCargoReady: string | null
  /**
   * Lines planned in here that the ERP has since stopped listing. A property of what is already
   * loaded rather than a second round trip: the sync brings closed lines down too, precisely so
   * a container can still name what is inside it.
   */
  closedLines: number
}

/** Allocations belonging to one container, in display order. */
export const allocationsOf = (allocations: Allocation[], containerId: string): Allocation[] =>
  allocations
    .filter((a) => a.containerId === containerId)
    .sort((a, b) => a.displayOrder - b.displayOrder)

/**
 * Totals for one container.
 *
 * An allocation whose master item is missing is SKIPPED rather than counted as zero — it would
 * otherwise inflate the line count with a row that can name nothing, and a container claiming
 * contents it cannot describe is the one number here worth being strict about.
 */
export function containerTotals(
  container: Pick<Container, 'capacityCbm'>,
  allocations: Allocation[],
  masterItems: MasterItem[],
): ContainerTotals {
  const byId = new Map(masterItems.map((m) => [m.id, m]))
  let lines = 0
  let cases = 0
  let cbm = 0
  let closedLines = 0
  let latestCargoReady: string | null = null

  for (const a of allocations) {
    const item = byId.get(a.masterItemId)
    if (!item) continue
    lines += 1
    cases += a.quantity
    cbm += item.cbmPerCase * a.quantity
    if (item.isClosed) closedLines += 1
    if (item.cargoReady && (!latestCargoReady || item.cargoReady > latestCargoReady)) {
      latestCargoReady = item.cargoReady
    }
  }

  const cap = container.capacityCbm
  return {
    lines,
    cases,
    cbm,
    fillPct: cap && cap > 0 ? Math.round((cbm / cap) * 100) : null,
    latestCargoReady,
    closedLines,
  }
}

/**
 * How much of a PO line is spoken for, across every container.
 *
 * Derived from allocations rather than read from `committedQuantity`, which counts only COMMITTED
 * containers. "What is left to plan" has to net off drafts as well, or the same cases get planned
 * into a second box.
 */
export function allocatedByItem(allocations: Allocation[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const a of allocations) {
    out.set(a.masterItemId, (out.get(a.masterItemId) ?? 0) + a.quantity)
  }
  return out
}
