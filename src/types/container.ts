export type ContainerType = '20GP' | '40GP' | '40HC'

export type ContainerStatus = 'draft' | 'committed'

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
}
