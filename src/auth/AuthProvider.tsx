import { createContext, useContext, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export type Role = 'admin' | 'internal' | 'factory'

export interface AuthContextValue {
  role: Role
  factoryName: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Placeholder: role is derived from the URL pathname so /admin, /internal, and
// /factory render with their respective role during development. Phase 12 replaces
// this with a real Supabase session read.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const role: Role = pathname.startsWith('/factory')
    ? 'factory'
    : pathname.startsWith('/internal')
      ? 'internal'
      : 'admin'

  return (
    <AuthContext.Provider value={{ role, factoryName: null }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
