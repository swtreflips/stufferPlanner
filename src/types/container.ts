export type ContainerType = '20GP' | '40GP' | '40HC' | '45HC'

export type ContainerStatus = 'draft' | 'committed'

export interface Container {
  id: string
  code: string                  // "DTSV03" — SUP+DEST+NN, immutable after creation
  status: ContainerStatus
  name: string                  // user-typed nickname
  type: ContainerType
  destination: string           // display string; matches MasterItem.shipTo
  supplierId: string            // restricts which POs can be allocated
  displayOrder: number
  ofqReference: string | null
  committedAt: string | null
  committedBy: string | null
  createdAt: string
}
