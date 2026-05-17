export interface Allocation {
  id: string
  containerId: string
  masterItemId: string
  quantity: number
  displayOrder: number
  createdBy: string
  createdAt: string
}

export type AllocationDialogMode =
  | { kind: 'create'; containerId: string; masterItemId: string }
  | { kind: 'edit'; allocationId: string }
