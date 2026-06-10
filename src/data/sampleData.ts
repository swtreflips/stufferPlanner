import type { MasterItem } from '../types/masterItem'
import type { Supplier } from '../types/supplier'
import type { Profile } from '../types/profile'

// Parse a "m/d/yyyy" string into an ISO timestamp (UTC midnight).
function mdyToISO(s: string): string {
  const [m, d, y] = s.split('/').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toISOString()
}

export const sampleSuppliers: Supplier[] = [
  { id: 'sup-apple', name: 'Apple Paper', code: 'AP' },
  { id: 'sup-pineapple', name: 'Pineapple Paper', code: 'PP' },
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
    email: 'michelle@applepaper.co',
    displayName: 'Michelle',
    role: 'factory',
    supplierId: 'sup-apple',
    supplierName: 'Apple Paper',
  },
  {
    id: 'user-prasad',
    email: 'prasad@pineapplepaper.com',
    displayName: 'Prasad',
    role: 'factory',
    supplierId: 'sup-pineapple',
    supplierName: 'Pineapple Paper',
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

// Sample seed data. Two suppliers (Apple Paper, Pineapple Paper) and five
// destinations. Most rows are single-line POs; PO203418 has two lines.
const seedRows: SeedRow[] = [
  { name: 'Apple Paper',     documentNumber: 'PO203418', shipTo: 'Orlando, FL',     lineId: 1, sku: 'APL-RM2204-WH', quantityRemaining: 310,  cbmPerCase: 0.082, cbmTotal: 25.389, cargoReady: '5/25/2026', dateIssued: '10/30/2025', requestedShipBy: '1/15/2026', eta: '1/22/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO203418', shipTo: 'Orlando, FL',     lineId: 2, sku: 'APL-RM1808-KR', quantityRemaining: 620,  cbmPerCase: 0.068, cbmTotal: 42.284, cargoReady: '5/28/2026', dateIssued: '10/30/2025', requestedShipBy: '1/15/2026', eta: '1/22/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO207791', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'GLOS-RM1407',   quantityRemaining: 225,  cbmPerCase: 0.067, cbmTotal: 15.000, cargoReady: '5/20/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO201256', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'MATT-RM0905',   quantityRemaining: 432,  cbmPerCase: 0.046, cbmTotal: 20.000, cargoReady: '5/20/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO209834', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'MATT-RM0905',   quantityRemaining: 648,  cbmPerCase: 0.046, cbmTotal: 30.000, cargoReady: '5/23/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO205677', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'CSTK-RM1612',   quantityRemaining: 300,  cbmPerCase: 0.070, cbmTotal: 21.000, cargoReady: '5/20/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO208120', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'BNDR-RM1407',   quantityRemaining: 300,  cbmPerCase: 0.063, cbmTotal: 19.000, cargoReady: '5/20/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO202945', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'NWSP-RM0905',   quantityRemaining: 612,  cbmPerCase: 0.054, cbmTotal: 33.000, cargoReady: '5/28/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO206503', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'RM2010',        quantityRemaining: 1000, cbmPerCase: 0.056, cbmTotal: 56.000, cargoReady: '5/20/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO204188', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'RM2010',        quantityRemaining: 1000, cbmPerCase: 0.056, cbmTotal: 56.000, cargoReady: '5/20/2026' },
  { name: 'Apple Paper',     documentNumber: 'PO209062', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'PRMM-RM2010',   quantityRemaining: 300,  cbmPerCase: 0.057, cbmTotal: 17.000, cargoReady: '5/20/2026' },
  { name: 'Pineapple Paper', documentNumber: 'PO210447', shipTo: 'Cincinnati, OH',  lineId: 1, sku: 'PNP-RM1407',    quantityRemaining: 1315, cbmPerCase: 0.054, cbmTotal: 70.907, cargoReady: '5/21/2026' },
  { name: 'Pineapple Paper', documentNumber: 'PO213985', shipTo: 'Lakeland, FL',    lineId: 1, sku: 'KRFT-RM1611',   quantityRemaining: 900,  cbmPerCase: 0.056, cbmTotal: 50.400, cargoReady: '5/29/2026' },
  { name: 'Pineapple Paper', documentNumber: 'PO211302', shipTo: 'Carrollton, TX',  lineId: 1, sku: 'KRFT-RM1611',   quantityRemaining: 900,  cbmPerCase: 0.056, cbmTotal: 50.400, cargoReady: '5/21/2026' },
  { name: 'Pineapple Paper', documentNumber: 'PO212760', shipTo: 'Simi Valley, CA', lineId: 1, sku: 'CSTK-RM1612',   quantityRemaining: 200,  cbmPerCase: 0.057, cbmTotal: 11.333, cargoReady: '5/21/2026' },
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
