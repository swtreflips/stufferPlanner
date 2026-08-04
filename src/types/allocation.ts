export interface Allocation {
  id: string
  containerId: string
  masterItemId: string
  quantity: number
  displayOrder: number
  createdAt: string
}

/**
 * How the allocation dialog was opened.
 *
 * `containerId` / `toContainerId` are what DRAG AND DROP fills in — the destination the user
 * already indicated by releasing somewhere. Absent means they clicked instead, and the dialog
 * leaves the destination picker for them to answer. The dialog behaves identically either way;
 * a drop just saves the one step.
 */
export type AllocationDialogMode =
  /** From a master row: cases leave the pool for a container. */
  | { kind: 'create'; masterItemId: string; containerId?: string }
  /** From a line in a container: cases go back to the pool, or on to another container. */
  | { kind: 'edit'; allocationId: string; toContainerId?: string }
