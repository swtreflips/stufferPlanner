import { supabase } from '../../lib/supabase'
import type { MasterItem } from '../../types/masterItem'
import type {
  Closure,
  ClosedReason,
  ConfirmedReason,
  ImportBatch,
  SyncConflict,
  SyncSummary,
} from '../../types/sync'
import type { MasterItemRepo } from './types'

/**
 * Open PO lines, from `planner_po_lines`.
 *
 * RLS decides the rows: internal sees every organization, a factory sees its own and any
 * sibling plant sharing a group. Nothing is filtered client-side — the moment a component
 * filters, the database stops being the boundary.
 *
 * The CBM columns read here are the GENERATED ones. `cbm_per_case_eff` and `cbm_total_eff`
 * resolve whichever figure the supplier actually supplied, deriving the other against
 * quantity_available. The app never does that arithmetic and never writes those columns —
 * a generated column is writable by nobody, which is what makes the derivation impossible to
 * bypass or disagree with.
 */
interface Row {
  id: string
  organization_id: string
  document_number: string
  sku: string
  quantity: number | null
  quantity_available: number | null
  committed_quantity: number | null
  due_date: string | null
  destination: string | null
  cargo_ready: string | null
  cbm_per_case_eff: number | null
  cbm_total_eff: number | null
  status: string
  raw: Record<string, unknown> | null
  organizations: { name: string | null } | null
}

const SELECT =
  'id, organization_id, document_number, sku, quantity, quantity_available, ' +
  'committed_quantity, due_date, destination, cargo_ready, cbm_per_case_eff, ' +
  'cbm_total_eff, status, raw, organizations(name)'

// planner_po_lines is keyed on (document_number, sku); there is no line_id column, because
// the internal export does not carry one. lineId is presentational only, so it is derived
// per PO from a stable sort — never persisted, never used to match anything.
function withLineIds(rows: Row[]): Map<string, number> {
  const seen = new Map<string, number>()
  const out = new Map<string, number>()
  for (const r of [...rows].sort((a, b) =>
    a.document_number.localeCompare(b.document_number) || a.sku.localeCompare(b.sku),
  )) {
    const n = (seen.get(r.document_number) ?? 0) + 1
    seen.set(r.document_number, n)
    out.set(r.id, n)
  }
  return out
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

interface ClosureRow {
  id: string
  supplier: string | null
  document_number: string
  sku: string
  closed_at: string
  days_open: number | null
  snapshots_seen: number
  reopen_count: number
  quantity: number | null
  quantity_available: number | null
  committed_quantity: number | null
  cargo_ready: string | null
  was_allocated: boolean
  reason: ClosedReason | ConfirmedReason | null
  reason_is_confirmed: boolean
  closed_reason_inferred: ClosedReason | null
  closed_note: string | null
  closed_confirmed_at: string | null
}

interface BatchRow {
  id: string
  pushed_at: string
  source: string | null
  row_count: number | null
  inserted_count: number | null
  updated_count: number | null
  closed_count: number | null
  reopened_count: number | null
  unchanged_count: number | null
  conflicts: unknown
}

/**
 * `planner_sync_preview` and `sync_po_lines` return the same JSON, built by the same helper
 * server-side — so one mapper covers both, and a field that appears in one necessarily appears
 * in the other.
 *
 * Module-level rather than a method: `this` only binds while a method is called off its object,
 * so destructuring the repo would break a method-based helper at runtime with nothing at
 * compile time to catch it. Same reasoning as `rpc()` in SupabaseContainerRepo.
 */
async function syncRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<SyncSummary> {
  const { data, error } = await supabase.rpc(fn, args)
  // A refused run raises inside the function, so the reason the database gave — an unknown
  // vendor named, a blast radius quantified — arrives here intact rather than as a generic
  // failure. That message is the whole feedback for a bad file, so it is surfaced verbatim.
  if (error) throw new Error(error.message)
  if (!data) throw new Error('The sync returned nothing.')

  const d = data as Record<string, unknown>
  return {
    inserted: Number(d.inserted ?? 0),
    updated: Number(d.updated ?? 0),
    closed: Number(d.closed ?? 0),
    reopened: Number(d.reopened ?? 0),
    unchanged: Number(d.unchanged ?? 0),
    rowsInFile: Number(d.rows_in_file ?? 0),
    closedByReason: (d.closed_by_reason ?? {}) as SyncSummary['closedByReason'],
    conflicts: ((d.conflicts ?? []) as Record<string, unknown>[]).map(
      (c): SyncConflict => ({
        conflict: c.conflict as SyncConflict['conflict'],
        documentNumber: String(c.document_number ?? ''),
        sku: String(c.sku ?? ''),
        supplier: String(c.supplier ?? ''),
        allocated: Number(c.allocated ?? 0),
      }),
    ),
    openLinesInScope: Number(d.open_lines_in_scope ?? 0),
    blastRadiusExceeded: Boolean(d.blast_radius_exceeded),
    dryRun: Boolean(d.dry_run),
    batchId: d.batch_id as string | undefined,
    forced: d.forced as boolean | undefined,
  }
}

export function createSupabaseMasterItemRepo(): MasterItemRepo {
  return {
    async fetchAll() {
      const { data, error } = await supabase
        .from('planner_po_lines')
        .select(SELECT)
        .order('document_number')
      if (error) throw new Error(`Failed to load open PO lines: ${error.message}`)

      const rows = (data ?? []) as unknown as Row[]
      const lineIds = withLineIds(rows)

      return rows.map((r): MasterItem => {
        const raw = r.raw ?? {}
        return {
          id: r.id,
          name: r.organizations?.name ?? '',
          supplierId: r.organization_id,
          dateIssued: str(raw['Date Issued']),
          documentNumber: r.document_number,
          shipTo: r.destination ?? '',
          requestedShipBy: r.due_date ?? '',
          status: str(raw['Status']),
          lineId: lineIds.get(r.id) ?? 1,
          sku: r.sku,
          originalQuantity: r.quantity_available ?? r.quantity ?? 0,
          committedQuantity: r.committed_quantity ?? 0,
          cbm: r.cbm_total_eff,
          cargoReady: r.cargo_ready ?? '',
          etd: null,
          eta: null,
          cbmPerCase: r.cbm_per_case_eff ?? 0,
          cbmTotal: r.cbm_total_eff ?? 0,
          isClosed: r.status === 'closed',
          raw,
        }
      })
    },

    // The three factory-writable fields. RLS decides WHICH rows; a BEFORE UPDATE trigger
    // decides WHICH COLUMNS — RLS grants access to rows, not columns, so without that
    // trigger a factory could rewrite quantities on its own lines.
    async updateCargoReady(id, isoDate) {
      const { error } = await supabase
        .from('planner_po_lines')
        .update({ cargo_ready: isoDate })
        .eq('id', id)
      if (error) throw new Error(`Failed to update cargo ready date: ${error.message}`)
    },

    async updateCbmPerCase(id, value) {
      const { error } = await supabase
        .from('planner_po_lines')
        .update({ cbm_per_case: value })
        .eq('id', id)
      if (error) throw new Error(`Failed to update CBM per case: ${error.message}`)
    },

    // Committed quantity is internal-only — the column trigger rejects it from a factory.
    async commitQuantity(id, delta) {
      const { data, error } = await supabase
        .from('planner_po_lines')
        .select('committed_quantity')
        .eq('id', id)
        .single()
      if (error) throw new Error(`Failed to read committed quantity: ${error.message}`)
      const next = (data?.committed_quantity ?? 0) + delta
      const { error: upErr } = await supabase
        .from('planner_po_lines')
        .update({ committed_quantity: next })
        .eq('id', id)
      if (upErr) throw new Error(`Failed to commit quantity: ${upErr.message}`)
    },

    /*
      THE WEEKLY SNAPSHOT. Both calls hand the whole file to the database and let it decide.

      No diffing happens here on purpose. The client deciding what changed would mean the client
      deciding what CLOSES, and a closure has consequences — allocations to flag, history to
      write, a reason to infer. That belongs in one transaction next to the data, not spread
      across a browser tab that might be reloaded halfway.
    */
    previewSync: (rows) => syncRpc('planner_sync_preview', { p_rows: rows }),

    applySync: (rows, force) =>
      syncRpc('sync_po_lines', { p_rows: rows, p_source: 'csv', p_force: force }),

    async fetchClosures() {
      const { data, error } = await supabase
        .from('planner_po_line_closures')
        .select(
          'id, supplier, document_number, sku, closed_at, days_open, snapshots_seen, ' +
            'reopen_count, quantity, quantity_available, committed_quantity, cargo_ready, ' +
            'was_allocated, reason, reason_is_confirmed, closed_reason_inferred, ' +
            'closed_note, closed_confirmed_at',
        )
        .order('closed_at', { ascending: false })
      if (error) throw new Error(`Failed to load closed PO lines: ${error.message}`)

      return (data ?? []).map((r): Closure => {
        const row = r as unknown as ClosureRow
        return {
          id: row.id,
          supplier: row.supplier ?? '',
          documentNumber: row.document_number,
          sku: row.sku,
          closedAt: row.closed_at,
          daysOpen: row.days_open,
          snapshotsSeen: row.snapshots_seen,
          reopenCount: row.reopen_count,
          quantity: row.quantity,
          quantityAvailable: row.quantity_available,
          committedQuantity: row.committed_quantity ?? 0,
          cargoReady: row.cargo_ready,
          wasAllocated: row.was_allocated,
          reason: row.reason,
          // Carried separately from `reason` all the way to the screen. Collapsing the two is
          // how a guess starts being quoted as a fact.
          reasonIsConfirmed: row.reason_is_confirmed,
          inferredReason: row.closed_reason_inferred,
          note: row.closed_note,
          confirmedAt: row.closed_confirmed_at,
        }
      })
    },

    async fetchImportBatches(limit) {
      const { data, error } = await supabase
        .from('planner_import_batches')
        .select(
          'id, pushed_at, source, row_count, inserted_count, updated_count, ' +
            'closed_count, reopened_count, unchanged_count, conflicts',
        )
        .order('pushed_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`Failed to load import history: ${error.message}`)

      return (data ?? []).map((r): ImportBatch => {
        const row = r as unknown as BatchRow
        return {
          id: row.id,
          pushedAt: row.pushed_at,
          source: row.source ?? 'csv',
          rowCount: row.row_count ?? 0,
          inserted: row.inserted_count ?? 0,
          updated: row.updated_count ?? 0,
          closed: row.closed_count ?? 0,
          reopened: row.reopened_count ?? 0,
          unchanged: row.unchanged_count ?? 0,
          conflictCount: Array.isArray(row.conflicts) ? row.conflicts.length : 0,
        }
      })
    },

    async confirmClosureReason(lineId, reason, note) {
      const { error } = await supabase.rpc('confirm_po_line_closure', {
        p_line_id: lineId,
        p_reason: reason,
        p_note: note,
      })
      if (error) throw new Error(`Failed to record the reason: ${error.message}`)
    },
  }
}
