export interface MasterItem {
  id: string
  name: string
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
}
