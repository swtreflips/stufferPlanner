export type ContainerType = '20GP' | '40GP' | '40HC'

export type ContainerStatus = 'draft' | 'committed'

// Operational lifecycle after commit. A freshly-committed container starts at
// 'committed'; the freight forwarder books it, confirms a vessel schedule, and
// finally ships it. Strictly sequential — see CONTCONFIG.md "Post-commit lifecycle".
export type LogisticsStatus = 'committed' | 'booked' | 'scheduled' | 'shipped'

// Confirmed schedule from the forwarder. Carried only at 'scheduled' / 'shipped'.
// Shape is the seam for the future schedules-project integration; embedded here
// for now to keep the in-memory model simple.
export interface ContainerSchedule {
  carrierName: string           // "Hapag-Lloyd", "COSCO", ...
  pol: string                   // port of loading
  pod: string                   // port of discharge
  lastCy: string | null         // ISO date — last day to drop empty at CY
  etd: string | null            // ISO date
  eta: string | null            // ISO date
  transitTimeDays: number | null
}

export interface Container {
  id: string
  code: string                  // "DT0001" — SUP+NNNN, immutable after creation
  status: ContainerStatus
  name: string                  // user-typed nickname
  type: ContainerType
  destination: string           // display string; matches MasterItem.shipTo
  supplierId: string            // restricts which POs can be allocated
  capacityCbm: number | null    // operational CBM cap; null if type has no configured capacity
  displayOrder: number
  ofqReference: string | null
  committedAt: string | null
  committedBy: string | null
  createdAt: string

  // Post-commit lifecycle. All null on drafts; logisticsStatus = 'committed'
  // on commit; the rest fill in as the container moves through booked →
  // scheduled → shipped. Uncommit resets everything back to null.
  logisticsStatus: LogisticsStatus | null
  bookedAt: string | null
  bookedBy: string | null
  schedule: ContainerSchedule | null
  scheduledAt: string | null
  scheduledBy: string | null
  shippedAt: string | null
  shippedBy: string | null
}
