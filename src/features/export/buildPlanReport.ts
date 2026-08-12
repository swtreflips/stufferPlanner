import type { Allocation } from '../../types/allocation'
import type { Container } from '../../types/container'
import type { MasterItem } from '../../types/masterItem'
import type { Supplier } from '../../types/supplier'
import { allocationsOf, containerTotals, allocatedByItem } from '../../components/containers/containerMetrics'

/*
  The stuffing plan as three tables of plain rows.

  PURE ON PURPOSE — no xlsx, no DOM, no store. Everything that can be wrong about this report is
  wrong in here (a total that does not add up, a line counted twice, a supplier's rows leaking into
  another's file), and none of it needs a browser to catch. writeWorkbook.ts does the untestable
  part and stays as thin as it can be.

  WHY THIS EXISTS. Container plans are agreed with suppliers over emailed spreadsheets while the
  plan itself lives in the app, so the two drift and nobody notices until a box is being loaded.
  This is the document that says what the app believes right now, in a form a supplier can correct
  and send back.

  The third sheet is the one that earns it. "Given this configuration, what is still open" is
  exactly what a thread of attachments loses track of, and it is what decides whether another
  container is needed.
*/

export interface ReportMeta {
  generatedAt: string
  generatedBy: string
  /** Supplier code, or 'ALL' when no filter is applied. Also the filename's middle segment. */
  scope: string
  containers: number
  contentLines: number
  openLines: number
}

export interface PlanReport {
  meta: ReportMeta
  containers: Record<string, unknown>[]
  contents: Record<string, unknown>[]
  open: Record<string, unknown>[]
}

/*
  Column order, stated rather than inferred.

  Without these the order comes from object key insertion, which happens to be right and would stay
  right until someone reorders a property while editing something else. They also give the writer
  a header row for a sheet with NO rows — "Open" being empty means everything is planned, which is
  worth showing as an empty table rather than a missing tab that reads as a broken export.
*/
export const CONTAINER_COLUMNS = [
  'Container', 'Name', 'Supplier', 'Type', 'Status', 'Stage', 'Destination', 'OFQ',
  'Lines', 'Cases', 'CBM', 'Capacity CBM', 'Fill %', 'Cargo ready',
  'Forwarder', 'Carrier', 'ETD', 'ETA',
] as const

export const CONTENT_COLUMNS = [
  'Container', 'Status', 'PO', 'SKU', 'Cases', 'CBM/case', 'CBM',
  'Destination', 'Cargo ready', 'PO closed',
] as const

export const OPEN_COLUMNS = [
  'PO', 'SKU', 'Supplier', 'Destination', 'Total cases', 'Allocated', 'Remaining',
  'CBM/case', 'Remaining CBM', 'Cargo ready', 'Requested ship by',
] as const

const round2 = (n: number) => Math.round(n * 100) / 100

/** 'DRAFT' / 'COMMITTED', with the post-commit stage after it when there is one. */
const statusOf = (c: Container) => c.status.toUpperCase()
const stageOf = (c: Container) => (c.status === 'committed' ? (c.logisticsStatus ?? 'committed') : '')

export interface BuildArgs {
  containers: Container[]
  allocations: Allocation[]
  masterItems: MasterItem[]
  suppliers: Supplier[]
  /** null = every supplier. Mirrors the on-screen filter, so you export what you are looking at. */
  supplierFilterId: string | null
  generatedBy: string
  now?: Date
}

export function buildPlanReport({
  containers, allocations, masterItems, suppliers, supplierFilterId, generatedBy, now = new Date(),
}: BuildArgs): PlanReport {
  /*
    SCOPE IS APPLIED FIRST, to the source collections, not to the output rows.

    Filtering at the end would leave it possible for one join to pull a row back in — and the
    failure mode is sending a supplier another supplier's plan, which is the exact thing the whole
    code-rename exercise was for. Narrow the inputs and the leak cannot be reintroduced downstream.
  */
  const scopedContainers = supplierFilterId
    ? containers.filter((c) => c.supplierId === supplierFilterId)
    : containers
  const scopedItems = supplierFilterId
    ? masterItems.filter((m) => m.supplierId === supplierFilterId)
    : masterItems

  const containerIds = new Set(scopedContainers.map((c) => c.id))
  const scopedAllocations = allocations.filter((a) => containerIds.has(a.containerId))

  const supplierCode = (id: string) => suppliers.find((s) => s.id === id)?.code ?? '—'
  const itemById = new Map(masterItems.map((m) => [m.id, m]))

  /* ── Sheet 1 — Containers ──────────────────────────────────────────────────
     Committed first, then drafts, each by code. Committed is what has been agreed and draft is
     what is being proposed; leading with the agreed half means the reader starts on the part that
     is settled. Empty containers ARE included — an empty box is a real state and the one a flat
     contents list would silently drop. */
  const ordered = [...scopedContainers].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'committed' ? -1 : 1
    return a.code.localeCompare(b.code)
  })

  const containerRows = ordered.map((c) => {
    const t = containerTotals(c, allocationsOf(scopedAllocations, c.id), masterItems)
    return {
      'Container': c.code,
      'Name': c.name,
      'Supplier': supplierCode(c.supplierId),
      'Type': c.type,
      'Status': statusOf(c),
      'Stage': stageOf(c),
      'Destination': c.destination,
      'OFQ': c.ofqReference ?? '',
      'Lines': t.lines,
      'Cases': t.cases,
      'CBM': round2(t.cbm),
      'Capacity CBM': c.capacityCbm ?? '',
      'Fill %': t.fillPct ?? '',
      'Cargo ready': t.latestCargoReady ?? '',
      'Forwarder': c.booking?.forwarder ?? '',
      'Carrier': c.booking?.carrier ?? c.schedule?.carrierName ?? '',
      'ETD': c.schedule?.etd ?? '',
      'ETA': c.schedule?.eta ?? '',
    }
  })

  /* ── Sheet 2 — Contents ────────────────────────────────────────────────────
     One row per allocation: the loading list, and the sheet a supplier replies about.

     A CLOSED PO LINE STILL APPEARS HERE, flagged. The ERP has stopped listing it but the cases are
     planned into a box, and an allocation outliving its line is precisely what someone needs to
     see before that box is loaded. It is excluded from Open below, because there is nothing left
     to plan against a line that no longer exists. */
  const contentRows = ordered.flatMap((c) =>
    allocationsOf(scopedAllocations, c.id).map((a) => {
      const item = itemById.get(a.masterItemId)
      return {
        'Container': c.code,
        'Status': statusOf(c),
        'PO': item?.documentNumber ?? '(unknown line)',
        'SKU': item?.sku ?? '',
        'Cases': a.quantity,
        'CBM/case': item ? round2(item.cbmPerCase) : '',
        'CBM': item ? round2(item.cbmPerCase * a.quantity) : '',
        'Destination': item?.shipTo ?? c.destination,
        'Cargo ready': item?.cargoReady ?? '',
        'PO closed': item?.isClosed ? 'YES' : '',
      }
    }),
  )

  /* ── Sheet 3 — Open ────────────────────────────────────────────────────────
     What is left. Allocated is summed from ALLOCATIONS, not read from committedQuantity, because
     that column counts only committed containers — netting off drafts too is the difference
     between "what is left to plan" and "what is left to commit", and planning the same cases into
     a second box is the mistake this sheet prevents.

     Closed lines are excluded: there is nothing to plan against a line the ERP has dropped. */
  const allocated = allocatedByItem(scopedAllocations)
  const openRows = scopedItems
    .filter((m) => !m.isClosed)
    .map((m) => {
      const used = allocated.get(m.id) ?? 0
      return { m, used, remaining: m.originalQuantity - used }
    })
    .filter((r) => r.remaining > 0)
    .sort((a, b) =>
      (a.m.cargoReady || '').localeCompare(b.m.cargoReady || '') ||
      a.m.documentNumber.localeCompare(b.m.documentNumber))
    .map(({ m, used, remaining }) => ({
      'PO': m.documentNumber,
      'SKU': m.sku,
      'Supplier': supplierCode(m.supplierId),
      'Destination': m.shipTo,
      'Total cases': m.originalQuantity,
      'Allocated': used,
      'Remaining': remaining,
      'CBM/case': round2(m.cbmPerCase),
      'Remaining CBM': round2(m.cbmPerCase * remaining),
      'Cargo ready': m.cargoReady ?? '',
      'Requested ship by': m.requestedShipBy ?? '',
    }))

  return {
    meta: {
      generatedAt: now.toISOString().slice(0, 16).replace('T', ' '),
      generatedBy,
      scope: supplierFilterId ? supplierCode(supplierFilterId) : 'ALL',
      containers: containerRows.length,
      contentLines: contentRows.length,
      openLines: openRows.length,
    },
    containers: containerRows,
    contents: contentRows,
    open: openRows,
  }
}

/** `planner-DTR-2026-08-12.xlsx`. The code is in the name so the wrong factory's file is obvious
    before it is attached, not after. */
export const reportFilename = (meta: ReportMeta): string =>
  `planner-${meta.scope}-${meta.generatedAt.slice(0, 10)}.xlsx`
