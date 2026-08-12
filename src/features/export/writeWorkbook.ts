import type { PlanReport, ReportMeta } from './buildPlanReport'
import {
  reportFilename, CONTAINER_COLUMNS, CONTENT_COLUMNS, OPEN_COLUMNS,
} from './buildPlanReport'

/*
  Rows → .xlsx → download. The ONLY file that imports xlsx, and deliberately the thinnest thing
  that can work: everything decidable lives in buildPlanReport, which needs no browser to test.

  xlsx is imported dynamically inside the function rather than at module scope. It is ~140 KB
  gzipped and this feature runs a few times a day — it has no business in the initial bundle. Same
  pattern as parseRateFile in RatesApp.
*/

/** The four-line stamp above every sheet. */
function stampRows(meta: ReportMeta, sheet: string): (string | number)[][] {
  return [
    [`Stuffing plan — ${sheet}`],
    [`Supplier: ${meta.scope}`, `Generated: ${meta.generatedAt}`, `By: ${meta.generatedBy}`],
    [`${meta.containers} containers`, `${meta.contentLines} allocated lines`, `${meta.openLines} open lines`],
    [],
  ]
}

/**
 * Column widths from the content, so nothing arrives as ####.
 *
 * A supplier opening a file to columns they have to widen by hand reads as carelessness, and this
 * document exists to be believed.
 */
function widths(columns: readonly string[], rows: Record<string, unknown>[]): { wch: number }[] {
  return columns.map((key) => {
    const longest = rows.reduce(
      (max, r) => Math.max(max, String(r[key] ?? '').length),
      key.length,
    )
    return { wch: Math.min(Math.max(longest + 2, 8), 42) }
  })
}

/**
 * Build the workbook and hand it to the browser.
 *
 * An EMPTY SHEET STILL GETS ITS HEADER ROW rather than being dropped. A supplier opening "Open"
 * and finding nothing has learned something real — everything is planned — whereas a missing tab
 * just looks broken and prompts an email asking whether the export worked.
 */
export async function downloadPlanReport(report: PlanReport): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const sheets: [string, readonly string[], Record<string, unknown>[]][] = [
    ['Containers', CONTAINER_COLUMNS, report.containers],
    ['Contents', CONTENT_COLUMNS, report.contents],
    ['Open', OPEN_COLUMNS, report.open],
  ]

  for (const [name, columns, rows] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(stampRows(report.meta, name))
    // `header` fixes the column ORDER and, for an empty sheet, still writes the header row —
    // sheet_add_json alone emits nothing at all for [], which would leave a tab that looks broken
    // rather than one that says "nothing is open".
    XLSX.utils.sheet_add_json(ws, rows, { origin: -1, header: columns as unknown as string[] })
    ws['!cols'] = widths(columns, rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  XLSX.writeFile(wb, reportFilename(report.meta))
}
