export interface Allocation {
  id: string
  containerId: string
  masterItemId: string
  quantity: number
  displayOrder: number
  createdAt: string
}

export type AllocationDialogMode =
  | { kind: 'create'; masterItemId: string; containerId?: string }
  | { kind: 'edit'; allocationId: string }
