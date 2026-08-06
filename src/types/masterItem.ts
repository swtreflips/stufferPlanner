/**
 * Which CBM figure the supplier actually supplied; the other one is calculated from it.
 *
 * Exactly one of `cbm_per_case` / `cbm_total` is stored, so this says which of the two numbers
 * on screen is a MEASUREMENT and which is arithmetic. It is not cosmetic: when the weekly ERP
 * sync revises quantity_available, the stored figure holds and the derived one moves.
 *
 * null means neither has been given yet — both read 0.
 */
export type CbmSource = 'per_case' | 'total' | null

export interface MasterItem {
  id: string
  name: string
  supplierId: string
  dateIssued: string
  documentNumber: string
  shipTo: string
  requestedShipBy: string
  status: string
  sku: string
  originalQuantity: number
  committedQuantity: number
  cbm: number | null
  cargoReady: string
  etd: number | null
  eta: string | null
  cbmPerCase: number
  cbmTotal: number
  cbmSource: CbmSource
  raw: Record<string, unknown>

  /**
   * The line no longer appears in the ERP export — fulfilled, cancelled, or entered in error.
   *
   * Closed lines are still LOADED. They are hidden from the grid by default, not dropped, because
   * an allocation can outlive the line it points at: a container built last week can hold a PO
   * that closed on Monday, and dropping the row would leave that card unable to name what is
   * inside it. The board filters; the store keeps everything.
   *
   * Distinct from `status`, which is the ERP's own free-text status and arrives via `raw`.
   */
  isClosed: boolean
}
