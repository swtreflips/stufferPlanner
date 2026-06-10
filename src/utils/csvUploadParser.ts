import Papa from 'papaparse'
import type { MasterItem } from '../types/masterItem'

// Pure parsing + matching + validation. No React. Returns categorized results
// for the upload preview to render. The dialog calls applyMatches() with the
// store action callbacks after the user confirms.

export interface CsvUploadInput {
  csvText: string
  masterItems: MasterItem[]
  // Optional supplier filter: if set, rows whose matched master item's
  // supplierId !== this value land in `skippedOtherSupplier`.
  scopeSupplierId?: string | null
}

export interface MatchedRow {
  masterItemId: string
  documentNumber: string
  sku: string
  currentCargoReady: string | null   // ISO
  newCargoReady: string | null       // ISO; null = no change
  currentCbmPerCase: number | null
  newCbmPerCase: number | null       // null = no change
}

export interface UnmatchedRow {
  documentNumber: string
  sku: string
  reason: string
}

export interface CsvUploadResult {
  ok: boolean
  fatalError?: string
  matched: MatchedRow[]               // includes only rows where at least one field changes
  unmatched: UnmatchedRow[]
  skippedOtherSupplier: number
  skippedNoChange: number
}

const REQ_DOC = 'document number'
const REQ_ITEM = 'item'
const COL_CARGO = 'cargo ready'
const COL_CBM = 'cbm per case'

export function parseCsvUpload(input: CsvUploadInput): CsvUploadResult {
  const parsed = Papa.parse<Record<string, string>>(input.csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return emptyResult({ fatalError: parsed.errors[0]?.message ?? 'Could not parse CSV.' })
  }

  const headerFields = parsed.meta.fields?.map((f) => f.toLowerCase()) ?? []
  const hasDoc = headerFields.includes(REQ_DOC)
  const hasItem = headerFields.includes(REQ_ITEM)
  const hasCargo = headerFields.includes(COL_CARGO)
  const hasCbm = headerFields.includes(COL_CBM)

  if (!hasDoc || !hasItem) {
    return emptyResult({
      fatalError: `Missing required column${!hasDoc && !hasItem ? 's' : ''}: ${
        [!hasDoc && 'Document Number', !hasItem && 'Item'].filter(Boolean).join(', ')
      }.`,
    })
  }
  if (!hasCargo && !hasCbm) {
    return emptyResult({
      fatalError: 'CSV must contain at least one of: Cargo Ready, CBM per Case.',
    })
  }

  // Build a lookup by (documentNumber, sku) — both normalized.
  const lookup = new Map<string, MasterItem>()
  for (const m of input.masterItems) {
    lookup.set(matchKey(m.documentNumber, m.sku), m)
  }

  const matched: MatchedRow[] = []
  const unmatched: UnmatchedRow[] = []
  let skippedOtherSupplier = 0
  let skippedNoChange = 0

  for (const row of parsed.data) {
    const doc = (row[REQ_DOC] ?? '').trim()
    const sku = (row[REQ_ITEM] ?? '').trim()
    if (!doc || !sku) continue // ignore blank rows
    const item = lookup.get(matchKey(doc, sku))
    if (!item) {
      unmatched.push({ documentNumber: doc, sku, reason: 'No matching PO line' })
      continue
    }

    if (input.scopeSupplierId && item.supplierId !== input.scopeSupplierId) {
      skippedOtherSupplier += 1
      continue
    }

    const rawCargo = hasCargo ? (row[COL_CARGO] ?? '').trim() : ''
    const rawCbm = hasCbm ? (row[COL_CBM] ?? '').trim() : ''

    let newCargo: string | null = null
    if (rawCargo) {
      const iso = parseDateToIso(rawCargo)
      if (iso === null) {
        unmatched.push({
          documentNumber: doc,
          sku,
          reason: `Invalid date: "${rawCargo}"`,
        })
        continue
      }
      // Apply only if it's different from current — comparing on day granularity.
      if (sameDay(iso, item.cargoReady)) newCargo = null
      else newCargo = iso
    }

    let newCbm: number | null = null
    if (rawCbm) {
      const parsedNum = Number(rawCbm)
      if (!Number.isFinite(parsedNum) || parsedNum < 0) {
        unmatched.push({
          documentNumber: doc,
          sku,
          reason: `Invalid CBM value: "${rawCbm}"`,
        })
        continue
      }
      if (closeEnough(parsedNum, item.cbmPerCase)) newCbm = null
      else newCbm = parsedNum
    }

    if (newCargo === null && newCbm === null) {
      skippedNoChange += 1
      continue
    }

    matched.push({
      masterItemId: item.id,
      documentNumber: item.documentNumber,
      sku: item.sku,
      currentCargoReady: item.cargoReady ?? null,
      newCargoReady: newCargo,
      currentCbmPerCase: item.cbmPerCase ?? null,
      newCbmPerCase: newCbm,
    })
  }

  return {
    ok: true,
    matched,
    unmatched,
    skippedOtherSupplier,
    skippedNoChange,
  }
}

function matchKey(doc: string, sku: string): string {
  return `${doc.trim().toUpperCase()}::${sku.trim().toUpperCase()}`
}

// Accept m/d/yyyy, mm/dd/yyyy, yyyy-mm-dd. Returns ISO at UTC midnight, or null.
function parseDateToIso(raw: string): string | null {
  const trimmed = raw.trim()
  // ISO yyyy-mm-dd
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return assemble(Number(y), Number(m), Number(d))
  }
  // US m/d/yyyy
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (usMatch) {
    const [, m, d, y] = usMatch
    return assemble(Number(y), Number(m), Number(d))
  }
  return null
}

function assemble(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function sameDay(isoA: string | null, isoB: string | null): boolean {
  if (!isoA || !isoB) return isoA === isoB
  return isoA.slice(0, 10) === isoB.slice(0, 10)
}

function closeEnough(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  // 4-decimal precision matches the grid formatter.
  return Math.abs(a - b) < 0.00005
}

function emptyResult(extra: Partial<CsvUploadResult> = {}): CsvUploadResult {
  return {
    ok: false,
    matched: [],
    unmatched: [],
    skippedOtherSupplier: 0,
    skippedNoChange: 0,
    ...extra,
  }
}
