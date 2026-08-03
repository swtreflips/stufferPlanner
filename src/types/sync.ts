/**
 * Shapes returned by the ERP snapshot sync.
 *
 * `SyncSummary` is returned by BOTH `planner_sync_preview` and `sync_po_lines` — the same
 * function builds it either way, which is what lets the confirm screen promise what the apply
 * will actually do. `dryRun` is the only field that distinguishes them.
 */

export type ClosedReason = 'fulfilled' | 'cancelled' | 'withdrawn' | 'unknown'
export type ConfirmedReason = 'fulfilled' | 'cancelled' | 'withdrawn' | 'other'

export type ConflictKind =
  | 'closed_while_allocated'
  | 'over_committed'
  | 'supplier_changed'

export interface SyncConflict {
  conflict: ConflictKind
  documentNumber: string
  sku: string
  supplier: string
  allocated: number
}

export interface SyncSummary {
  inserted: number
  updated: number
  closed: number
  reopened: number
  unchanged: number
  rowsInFile: number
  /** How many closures fell into each inferred reason. Keys are a subset of ClosedReason. */
  closedByReason: Partial<Record<ClosedReason, number>>
  conflicts: SyncConflict[]
  openLinesInScope: number
  /**
   * The run would close more than a quarter of the open lines it can see. The PREVIEW reports
   * this; only the apply refuses on it, and only without `force`.
   */
  blastRadiusExceeded: boolean
  dryRun: boolean
  batchId?: string
  forced?: boolean
}

/** One row of `planner_po_line_closures`. */
export interface Closure {
  id: string
  supplier: string
  documentNumber: string
  sku: string
  closedAt: string
  daysOpen: number | null
  snapshotsSeen: number
  reopenCount: number
  quantity: number | null
  quantityAvailable: number | null
  committedQuantity: number
  cargoReady: string | null
  wasAllocated: boolean
  /** Confirmed if there is one, otherwise the sync's inference. */
  reason: ClosedReason | ConfirmedReason | null
  /** Which of the two the line above actually is. Never merge these. */
  reasonIsConfirmed: boolean
  inferredReason: ClosedReason | null
  note: string | null
  confirmedAt: string | null
}

/** One row of `planner_import_batches`. */
export interface ImportBatch {
  id: string
  pushedAt: string
  source: string
  rowCount: number
  inserted: number
  updated: number
  closed: number
  reopened: number
  unchanged: number
  conflictCount: number
}
