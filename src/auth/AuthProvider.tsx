import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { Profile, Role } from '../types/profile'
import { sampleProfiles } from '../data/sampleData'

export type { Role } from '../types/profile'

export interface AuthContextValue {
  user: Profile
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Resolve which placeholder user the current route represents. Phase 12 swaps
// this for a real Supabase session read + profile fetch — the AuthContextValue
// shape stays identical so consumers don't change.
function resolveUserFromPath(pathname: string): Profile {
  if (pathname.startsWith('/factory')) {
    const factoryProfiles = sampleProfiles.filter((p) => p.role === 'factory')
    // Extract the slug after /factory/ (e.g. /factory/ditar → "ditar").
    const segments = pathname.split('/').filter(Boolean) // ["factory", "ditar"]
    const slug = segments[1]?.toLowerCase()
    if (slug) {
      const match = factoryProfiles.find((p) =>
        p.supplierName?.toLowerCase().startsWith(slug),
      )
      if (match) return match
    }
    return factoryProfiles[0]
  }
  if (pathname.startsWith('/internal')) {
    return findByRole('internal')
  }
  return findByRole('admin')
}

function findByRole(role: Role): Profile {
  const found = sampleProfiles.find((p) => p.role === role)
  if (!found) throw new Error(`No placeholder profile seeded for role "${role}"`)
  return found
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const user = useMemo(() => resolveUserFromPath(pathname), [pathname])

  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
