export type Role = 'admin' | 'internal' | 'factory'

export interface Profile {
  id: string
  email: string
  displayName: string
  role: Role
  supplierId: string | null
  supplierName: string | null

  /**
   * Still on the temporary password issued at onboarding. Drives a banner and nothing else —
   * see migration 20260803160000. Only ever true for the signed-in user's own profile in
   * practice; other people's rows are directory data and nobody renders this for them.
   */
  mustChangePassword: boolean
}
