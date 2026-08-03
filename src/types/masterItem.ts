export interface MasterItem {
  id: string
  name: string
  supplierId: string
  dateIssued: string
  documentNumber: string
  shipTo: string
  requestedShipBy: string
  status: string
  lineId: number
  sku: string
  originalQuantity: number
  committedQuantity: number
  cbm: number | null
  cargoReady: string
  etd: number | null
  eta: string | null
  cbmPerCase: number
  cbmTotal: number
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
