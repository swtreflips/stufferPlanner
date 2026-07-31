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
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loudly. Missing VITE_* vars produce `createClient(undefined)`, whose symptom is
  // "Failed to fetch" on the first call — which reads as a network fault and sends you
  // debugging the wrong layer entirely.
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Vite inlines these at BUILD time, so a deploy made before they were configured will ' +
      'not have them — set them and redeploy.',
  )
}

export const supabase = createClient(url, anonKey)
