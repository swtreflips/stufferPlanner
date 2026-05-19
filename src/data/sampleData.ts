import type { MasterItem } from '../types/masterItem'
import type { Supplier } from '../types/supplier'
import type { Profile } from '../types/profile'

// Parse a "m/d/yyyy" string into an ISO timestamp (UTC midnight).
function mdyToISO(s: string): string {
  const [m, d, y] = s.split('/').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toISOString()
}

export const sampleSuppliers: Supplier[] = [
  { id: 'sup-ditar', name: 'Ditar S.A', code: 'DT' },
  { id: 'sup-tejaswi', name: 'Tejaswi Plastic Pvt Ltd.', code: 'TP' },
]

const supplierIdByName = new Map(sampleSuppliers.map((s) => [s.name, s.id]))

export const sampleProfiles: Profile[] = [
  {
    id: 'user-mike',
    email: 'hernandez73k@gmail.com',
    displayName: 'Mike',
    role: 'admin',
    supplierId: null,
    supplierName: null,
  },
  {
    id: 'user-internal',
    email: 'internal@stufferplanner.local',
    displayName: 'Internal',
    role: 'internal',
    supplierId: null,
    supplierName: null,
  },
  {
    id: 'user-michelle',
    email: 'mberrueco@ditar.co',
    displayName: 'Michelle',
    role: 'factory',
    supplierId: 'sup-ditar',
    supplierName: 'Ditar S.A',
  },
  {
    id: 'user-prasad',
    email: 'prasad.tejaswiplastic@gmail.com',
    displayName: 'Prasad',
    role: 'factory',
    supplierId: 'sup-tejaswi',
    supplierName: 'Tejaswi Plastic Pvt Ltd.',
  },
]

interface SeedRow {
  name: string
  documentNumber: string
  shipTo: string
  lineId: number
  sku: string
  quantityRemaining: number
  cbmPerCase: number
  cbmTotal: number
  cargoReady: string // "m/d/yyyy"
  dateIssued?: string // "m/d/yyyy"
  requestedShipBy?: string // "m/d/yyyy"
  eta?: string // "m/d/yyyy"
}

// From plannerData.csv. Two suppliers (Ditar S.A, Tejaswi Plastic Pvt Ltd.) and
// five destinations. Most rows are single-line POs; PO155276 has two lines.
const seedRows: SeedRow[] = [
  { name: 'Ditar S.A',                documentNumber: 'PO155276', shipTo: 'Orlando, FL',     lineId: 1, sku: 'LEVI-NK16616-MX', quantityRemaining: 310,  cbmPerCase: 0.082, cbmTotal: 25.389, cargoReady: '5/25/2026', dateIssued: '10/30/2025', requestedShipBy: '1/15/2026', eta: '1/22/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO155276', shipTo: 'Orlando, FL',     lineId: 2, sku: 'LEVI-NK13613-MX', quantityRemaining: 620,  cbmPerCase: 0.068, cbmTotal: 42.284, cargoReady: '5/28/2026', dateIssued: '10/30/2025', requestedShipBy: '1/15/2026', eta: '1/22/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154455', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'JKBR-NK13713',    quantityRemaining: 225,  cbmPerCase: 0.067, cbmTotal: 15.000, cargoReady: '5/20/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154501', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'TCCF-NK10712',    quantityRemaining: 432,  cbmPerCase: 0.046, cbmTotal: 20.000, cargoReady: '5/20/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154503', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'TCCF-NK10712',    quantityRemaining: 648,  cbmPerCase: 0.046, cbmTotal: 30.000, cargoReady: '5/23/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154500', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'URTH-NK141015',   quantityRemaining: 300,  cbmPerCase: 0.070, cbmTotal: 21.000, cargoReady: '5/20/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154511', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'BIAG-NK13713',    quantityRemaining: 300,  cbmPerCase: 0.063, cbmTotal: 19.000, cargoReady: '5/20/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154512', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'BGMP-NK10712',    quantityRemaining: 612,  cbmPerCase: 0.054, cbmTotal: 33.000, cargoReady: '5/28/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154515', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'NK121012',        quantityRemaining: 1000, cbmPerCase: 0.056, cbmTotal: 56.000, cargoReady: '5/20/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154516', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'NK121012',        quantityRemaining: 1000, cbmPerCase: 0.056, cbmTotal: 56.000, cargoReady: '5/20/2026' },
  { name: 'Ditar S.A',                documentNumber: 'PO154517', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'ALAD-NK121012',   quantityRemaining: 300,  cbmPerCase: 0.057, cbmTotal: 17.000, cargoReady: '5/20/2026' },
  { name: 'Tejaswi Plastic Pvt Ltd.', documentNumber: 'PO154134', shipTo: 'Cincinnati, OH',  lineId: 1, sku: 'CDTS-NK13713',    quantityRemaining: 1315, cbmPerCase: 0.054, cbmTotal: 70.907, cargoReady: '5/21/2026' },
  { name: 'Tejaswi Plastic Pvt Ltd.', documentNumber: 'PO154147', shipTo: 'Lakeland, FL',    lineId: 1, sku: 'CHDR-NK151017',   quantityRemaining: 900,  cbmPerCase: 0.056, cbmTotal: 50.400, cargoReady: '5/29/2026' },
  { name: 'Tejaswi Plastic Pvt Ltd.', documentNumber: 'PO154148', shipTo: 'Carrollton, TX',  lineId: 1, sku: 'CHDR-NK151017',   quantityRemaining: 900,  cbmPerCase: 0.056, cbmTotal: 50.400, cargoReady: '5/21/2026' },
  { name: 'Tejaswi Plastic Pvt Ltd.', documentNumber: 'PO154193', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'URTH-NK141015',   quantityRemaining: 200,  cbmPerCase: 0.057, cbmTotal: 11.333, cargoReady: '5/21/2026' },
]

export const sampleMasterItems: MasterItem[] = seedRows.map((r) => {
  const supplierId = supplierIdByName.get(r.name)
  if (!supplierId) {
    throw new Error(`No supplier seeded for name "${r.name}"`)
  }
  return {
    id: `${r.documentNumber}-${r.lineId}`,
    name: r.name,
    supplierId,
    dateIssued: r.dateIssued ? mdyToISO(r.dateIssued) : '',
    documentNumber: r.documentNumber,
    shipTo: r.shipTo,
    requestedShipBy: r.requestedShipBy ? mdyToISO(r.requestedShipBy) : '',
    status: '',
    lineId: r.lineId,
    sku: r.sku,
    originalQuantity: r.quantityRemaining,
    committedQuantity: 0,
    cbm: null,
    cargoReady: mdyToISO(r.cargoReady),
    etd: null,
    eta: r.eta ? mdyToISO(r.eta) : null,
    cbmPerCase: r.cbmPerCase,
    cbmTotal: r.cbmTotal,
    raw: { ...r },
  }
})
