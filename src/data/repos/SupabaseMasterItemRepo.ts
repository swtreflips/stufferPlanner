import { supabase } from '../../lib/supabase'
import type { MasterItem } from '../../types/masterItem'
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
  raw: Record<string, unknown> | null
  organizations: { name: string | null } | null
}

const SELECT =
  'id, organization_id, document_number, sku, quantity, quantity_available, ' +
  'committed_quantity, due_date, destination, cargo_ready, cbm_per_case_eff, ' +
  'cbm_total_eff, raw, organizations(name)'

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
  }
}
