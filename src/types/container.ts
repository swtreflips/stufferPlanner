export type ContainerType = '20GP' | '40GP' | '40HC' | '45HC'

export type ContainerStatus = 'draft' | 'committed'

export interface Container {
  id: string
  status: ContainerStatus
  name: string
  type: ContainerType
  destination: string
  displayOrder: number
  ofqReference: string | null
  committedAt: string | null
  createdAt: string
}
