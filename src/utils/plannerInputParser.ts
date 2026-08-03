import Papa from 'papaparse'

/**
 * The internal ERP export → the snapshot `sync_po_lines` expects.
 *
 * Pure. No React, no network. The panel parses, shows what it found, and hands the array
 * straight to the RPC — every decision about what the rows MEAN is made in the database, so
 * this file only has to get the shape right.
 *
 * HEADER-INDEXED, NOT HEADER-KEYED, and that is not a style choice: the export carries
 * `Quantity Billed` TWICE. Papa's `header: true` mode would silently rename the second to
 * `Quantity Billed_1` (or drop it, depending on version), and a parser that quietly invents a
 * column name is a parser that will one day map the wrong one. Reading by position and folding
 * duplicates deliberately keeps that decision visible.
 */

export interface SnapshotRow {
  internal_id: string | null
  document_number: string
  sku: string
  supplier: string
  quantity: number | null
  quantity_available: number | null
  due_date: string | null           // ISO
  origin: string | null
  pol: string | null
  destination: string | null
  raw: Record<string, string>       // every unmapped, non-empty column
}

export interface SnapshotParseResult {
  ok: boolean
  fatalError?: string
  rows: SnapshotRow[]
  skippedBlank: number
  /** Headers that went to `raw` rather than a column. Shown so a reshaped export is noticed. */
  unmappedHeaders: string[]
}

/**
 * Exact header text → column. Case-insensitive on match, but otherwise literal: a renamed
 * column should fail loudly here rather than arrive as NULL and read as a cleared field.
 */
const COLUMNS: Record<string, keyof SnapshotRow> = {
  'internal id': 'internal_id',
  'document number': 'document_number',
  'item': 'sku',
  'supplier': 'supplier',
  'quantity': 'quantity',
  'quantity available': 'quantity_available',
  'due date/receive by': 'due_date',
  'origin': 'origin',
  'pol': 'pol',
  'destination city state': 'destination',
}

const REQUIRED = ['document number', 'item', 'supplier', 'quantity available'] as const

/**
 * `M/D/YYYY`, which is what the export writes. Parsed by hand rather than with `new Date(s)`:
 * that constructor reads an unpadded slash date according to the runtime's locale, so the same
 * file would produce a different day on a machine set to en-GB. A cargo date off by months is
 * not the kind of bug that announces itself.
 */
function toIsoDate(value: string): string | null {
  const s = value.trim()
  if (!s) return null

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (slash) {
    const [, m, d, y] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Already ISO — accept it, so a re-exported file does not have to be converted back.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  return null
}

function toNumber(value: string): number | null {
  const s = value.trim().replace(/,/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function parsePlannerInput(csvText: string): SnapshotParseResult {
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: 'greedy' })

  if (parsed.data.length === 0) {
    return {
      ok: false,
      fatalError: parsed.errors[0]?.message ?? 'That file has no rows.',
      rows: [],
      skippedBlank: 0,
      unmappedHeaders: [],
    }
  }

  const header = (parsed.data[0] ?? []).map((h) => (h ?? '').trim())
  const keyed = header.map((h) => COLUMNS[h.toLowerCase()] ?? null)

  const missing = REQUIRED.filter(
    (r) => !header.some((h) => h.toLowerCase() === r),
  )
  if (missing.length > 0) {
    return {
      ok: false,
      fatalError:
        `This does not look like the PO export — missing ${missing.join(', ')}. ` +
        `Expected columns: ${Object.keys(COLUMNS).join(', ')}.`,
      rows: [],
      skippedBlank: 0,
      unmappedHeaders: [],
    }
  }

  const unmapped = header.filter((h, i) => keyed[i] === null && h.length > 0)
  const rows: SnapshotRow[] = []
  let skippedBlank = 0

  for (const record of parsed.data.slice(1)) {
    if (!record.some((c) => (c ?? '').trim())) {
      skippedBlank++
      continue
    }

    const row: SnapshotRow = {
      internal_id: null,
      document_number: '',
      sku: '',
      supplier: '',
      quantity: null,
      quantity_available: null,
      due_date: null,
      origin: null,
      pol: null,
      destination: null,
      raw: {},
    }

    header.forEach((name, i) => {
      const value = (record[i] ?? '').trim()
      const column = keyed[i]

      if (column === null) {
        // Unmapped columns are kept verbatim so a reshaped export loses nothing, and empties are
        // dropped so an added-but-blank column does not make every row look changed next week.
        // A repeated header folds to its last non-empty value — both copies of `Quantity Billed`
        // carry the same figure, and picking one silently is better than inventing a second key.
        if (value) row.raw[name] = value
        return
      }

      if (column === 'quantity' || column === 'quantity_available') {
        row[column] = toNumber(value)
      } else if (column === 'due_date') {
        row.due_date = toIsoDate(value)
      } else {
        row[column] = (value || null) as never
      }
    })

    // Both halves of the natural key must be present; without them the row cannot be matched,
    // inserted, or reported on, and the database would reject it anyway.
    if (!row.document_number || !row.sku || !row.supplier) {
      skippedBlank++
      continue
    }

    rows.push(row)
  }

  if (rows.length === 0) {
    return {
      ok: false,
      fatalError: 'No usable rows — every line was missing a document number, item or supplier.',
      rows: [],
      skippedBlank,
      unmappedHeaders: unmapped,
    }
  }

  return { ok: true, rows, skippedBlank, unmappedHeaders: unmapped }
}
