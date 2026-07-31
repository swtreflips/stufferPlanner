import { createClient } from '@supabase/supabase-js'

/**
 * The one Supabase client for the planner.
 *
 * Points at the SHARED rates project — the same database RatesApp and Schedules use. One
 * person has one login across all three; `profiles` is the single directory.
 *
 * Both values are PUBLIC and inlined at build time by Vite. The anon key is safe in a bundle
 * because RLS is the boundary: `anon` has no grant on any planner table, so an unauthenticated
 * caller is denied outright rather than shown an empty board.
 *
 * MISCONFIGURATION MUST NOT THROW HERE. An earlier version threw at module scope, which is
 * worse than useless: the throw happens during import, before React mounts, so the page paints
 * WHITE and the only evidence is a console line nobody has open. A blank screen is the least
 * debuggable failure there is. The error is data now, and AuthProvider renders it.
 *
 * Vite inlines these at BUILD time, which makes two failures look identical and blank:
 *   - dev server started BEFORE .env existed  → restart it
 *   - Vercel built before the vars were set   → set them and REDEPLOY
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const missing = [
  !url && 'VITE_SUPABASE_URL',
  !anonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean) as string[]

export const configError: string | null = missing.length
  ? `Missing ${missing.join(' and ')}.`
  : null

// A placeholder keeps createClient from throwing when unconfigured. It is never reached:
// AuthProvider checks configError first and renders the fault instead of any children.
export const supabase = createClient(
  url || 'http://unconfigured.invalid',
  anonKey || 'unconfigured',
)
