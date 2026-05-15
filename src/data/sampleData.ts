import type { OpenPoItem } from '../types/openPoItem'
import { excelSerialToISO } from '../utils/dateHelpers'

interface SeedRow {
  documentNumber: string
  lineId: number
  sku: string
  dateIssuedSerial: number
  requestedShipBySerial: number
  cargoReadySerial: number
  quantityRemaining: number
  cbmPerCase: number
  etdDays: number
  eta: string
}

const NAME = 'Ditar S.A'
const SHIP_TO = 'Simi Valley, CA'

const seedRows: SeedRow[] = [
  { documentNumber: 'PO155049', lineId: 1, sku: 'CFLF-WT10712',  dateIssuedSerial: 46058, requestedShipBySerial: 46104, cargoReadySerial: 46104, quantityRemaining: 100, cbmPerCase: 0.0517, etdDays: 120, eta: '2026-05-08T00:00:00.000Z' },
  { documentNumber: 'PO155049', lineId: 2, sku: 'CFLF-WT121012', dateIssuedSerial: 46058, requestedShipBySerial: 46104, cargoReadySerial: 46104, quantityRemaining: 100, cbmPerCase: 0.0603, etdDays: 120, eta: '2026-05-08T00:00:00.000Z' },
  { documentNumber: 'PO155026', lineId: 1, sku: 'DELB-NK141015', dateIssuedSerial: 46056, requestedShipBySerial: 46139, cargoReadySerial: 46102, quantityRemaining: 100, cbmPerCase: 0.034,  etdDays: 120, eta: '2026-05-15T00:00:00.000Z' },
  { documentNumber: 'PO155087', lineId: 1, sku: 'RPLQ-NK10712',  dateIssuedSerial: 46062, requestedShipBySerial: 46118, cargoReadySerial: 45909, quantityRemaining: 100, cbmPerCase: 0.0728, etdDays: 120, eta: '2026-05-22T00:00:00.000Z' },
  { documentNumber: 'PO155087', lineId: 2, sku: 'RPLQ-NK13713',  dateIssuedSerial: 46062, requestedShipBySerial: 46118, cargoReadySerial: 45909, quantityRemaining: 100, cbmPerCase: 0.0728, etdDays: 120, eta: '2026-05-22T00:00:00.000Z' },
  { documentNumber: 'PO155087', lineId: 3, sku: 'RPLQ-NK8510',   dateIssuedSerial: 46062, requestedShipBySerial: 46118, cargoReadySerial: 45909, quantityRemaining: 100, cbmPerCase: 0.0517, etdDays: 120, eta: '2026-05-22T00:00:00.000Z' },
  { documentNumber: 'PO155087', lineId: 4, sku: 'RPLQ-NK141015', dateIssuedSerial: 46062, requestedShipBySerial: 46118, cargoReadySerial: 45909, quantityRemaining: 100, cbmPerCase: 0.0682, etdDays: 120, eta: '2026-05-22T00:00:00.000Z' },
  { documentNumber: 'PO155173', lineId: 1, sku: 'LEVI-NK16616',  dateIssuedSerial: 46080, requestedShipBySerial: 46125, cargoReadySerial: 46127, quantityRemaining: 285, cbmPerCase: 0.0819, etdDays: 120, eta: '2026-06-12T00:00:00.000Z' },
  { documentNumber: 'PO155173', lineId: 2, sku: 'LEVI-NK13613',  dateIssuedSerial: 46080, requestedShipBySerial: 46125, cargoReadySerial: 46127, quantityRemaining: 150, cbmPerCase: 0.0682, etdDays: 120, eta: '2026-06-12T00:00:00.000Z' },
  { documentNumber: 'PO155176', lineId: 1, sku: 'LEVI-NK16616',  dateIssuedSerial: 46080, requestedShipBySerial: 46125, cargoReadySerial: 46128, quantityRemaining: 225, cbmPerCase: 0.0819, etdDays: 120, eta: '2026-06-19T00:00:00.000Z' },
  { documentNumber: 'PO155176', lineId: 2, sku: 'LEVI-NK13613',  dateIssuedSerial: 46080, requestedShipBySerial: 46125, cargoReadySerial: 46128, quantityRemaining: 195, cbmPerCase: 0.0682, etdDays: 120, eta: '2026-06-19T00:00:00.000Z' },
]

export const sampleOpenPoItems: OpenPoItem[] = seedRows.map((r) => ({
  id: `${r.documentNumber}-${r.lineId}`,
  name: NAME,
  dateIssued: excelSerialToISO(r.dateIssuedSerial),
  documentNumber: r.documentNumber,
  shipTo: SHIP_TO,
  requestedShipBy: excelSerialToISO(r.requestedShipBySerial),
  status: '',
  lineId: r.lineId,
  sku: r.sku,
  quantityRemaining: r.quantityRemaining,
  cbm: null,
  cargoReady: excelSerialToISO(r.cargoReadySerial),
  etd: r.etdDays,
  eta: r.eta,
  cbmPerCase: r.cbmPerCase,
  cbmTotal: Number((r.cbmPerCase * r.quantityRemaining).toFixed(4)),
  raw: { ...r },
}))
