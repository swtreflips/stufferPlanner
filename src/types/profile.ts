export type Role = 'admin' | 'internal' | 'factory'

export interface Profile {
  id: string
  email: string
  displayName: string
  role: Role
  supplierId: string | null
  supplierName: string | null
}
