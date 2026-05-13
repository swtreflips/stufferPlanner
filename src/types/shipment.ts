export interface ShipmentRow {
  id: string
  name: string
  dateIssued: string
  documentNumber: string
  shipTo: string
  requestedShipBy: string
  status: string
  lineId: number
  sku: string
  quantityRemaining: number
  cbm: number | null
  cargoReady: string
  etd: number | null
  eta: string | null
  cbmPerCase: number
  cbmTotal: number
  container: string
  configGroup: string
  assignedContainerId: string | null
  raw: Record<string, unknown>
}
