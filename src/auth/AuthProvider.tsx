import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { profileRepo } from '../data/repos'
import type { Profile } from '../types/profile'

export type { Role } from '../types/profile'

export interface AuthContextValue {
  user: Profile
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Real identity for the planner.
 *
 * This replaces a placeholder that inferred the user from the URL — /factory/apple resolved
 * to Apple Paper's sample profile. Fine for building the UI, and exactly the thing that
 * cannot ship: the "identity" was a path segment anyone could type.
 *
 * THE PROVIDER GATES. Children render only once a real session AND a real profile exist, so
 * `useAuth().user` is never null and none of the eleven consumers had to change — the seam
 * held, which is why AuthContextValue was shaped this way from the start.
 *
 * Identity comes from `profiles`, never from user_metadata. user_metadata is USER-WRITABLE:
 * a signed-in person can rewrite it from the browser console. RatesApp read role from there
 * and a forwarder could mount the internal domain; that is fixed, and this app never repeats it.
 *
 *   profile === undefined  loading — decide nothing
 *   profile === null       no row, or the query failed → NO ACCESS
 *
 * A failed query resolves to null rather than retrying or guessing. Denying a real user on a
 * network blip is recoverable; admitting an unknown one is not.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) {
      setProfile(null)
      return
    }
    let active = true
    setProfile(undefined) // loading — NOT "no access"

    profileRepo
      .findById(uid)
      .then((p) => {
        if (active) setProfile(p)
      })
      .catch(() => {
        if (active) setProfile(null) // fail closed
      })
    return () => {
      active = false
    }
  }, [session?.user?.id])

  // Ordering matters: "still loading" must never fall through to "denied", or a slow network
  // reads as a locked account.
  if (loading || (session && profile === undefined)) return <Centered>Loading…</Centered>
  if (!session) return <SignIn />
  if (!profile) return <NoAccess email={session.user.email} />

  return <AuthContext.Provider value={{ user: profile }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/* ── gate screens ──────────────────────────────────────────────────────── */

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-white px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Stuffer Planner</h1>
      {children}
    </div>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // No success branch: onAuthStateChange fires and this component unmounts.
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <Centered>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="username"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
      <p className="max-w-xs text-xs text-slate-500">
        Same credentials as RatesApp. Accounts are created by an administrator — there is no
        self-registration.
      </p>
    </Centered>
  )
}

function NoAccess({ email }: { email?: string }) {
  return (
    <Centered>
      <p className="text-sm text-slate-700">
        {email ? `${email} is signed in, but has no profile in this workspace.` : 'No profile.'}
      </p>
      <p className="max-w-sm text-xs text-slate-500">
        Ask an administrator to set one up. Authenticated is not the same as authorised.
      </p>
      <button
        onClick={() => supabase.auth.signOut()}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        Sign out
      </button>
    </Centered>
  )
}
