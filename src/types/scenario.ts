export interface Scenario {
  id: string
  name: string
  parentId: string | null
  createdBy: string
  createdAt: string
  archivedAt: string | null
}
