import { useState, type FormEvent } from 'react'
import { Check, Eye, EyeOff, KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'

/**
 * Set your own password.
 *
 * Accounts are handed over with a temporary password read out or emailed by internal staff. This
 * is where that becomes something only the person holding it knows.
 *
 * THE CURRENT PASSWORD IS CHECKED, and Supabase does not require it. `auth.updateUser({ password })`
 * succeeds on any live session, so without this a walk-up to an unattended browser on a shared
 * factory terminal is enough to lock the real user out of their own account — no credential
 * needed. `security_update_password_require_reauthentication` is off on this project, so the
 * check lives here.
 *
 * Re-authenticating with `signInWithPassword` as the SAME user replaces the session with an
 * equivalent one, which is harmless. A failed attempt leaves the existing session untouched, so a
 * wrong guess costs a message and nothing else.
 *
 * The password is shared across every app on this Supabase project — the planner, RatesApp and
 * Schedules are one login — and the form says so, because changing it here and then failing to
 * get into another tool would otherwise read as a broken app.
 */

/** Project setting, `password_min_length`. Stated rather than discovered by rejection. */
const MIN_LENGTH = 10

export default function PasswordPanel() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && next !== confirm
  const sameAsOld = next.length > 0 && next === current
  const canSubmit =
    !busy && current.length > 0 && next.length >= MIN_LENGTH && next === confirm && !sameAsOld

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      // 1. Prove they know the current one.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      })
      if (authError) {
        setError('That current password is not right.')
        return
      }

      // 2. Set the new one.
      const { error: updateError } = await supabase.auth.updateUser({ password: next })
      if (updateError) {
        setError(updateError.message)
        return
      }

      // 3. Clear the onboarding banner. Its failure is deliberately swallowed: the password IS
      //    changed by this point, and reporting an error over a nag flag would tell the user
      //    their password did not change when it did. Worst case the banner shows once more.
      await supabase.rpc('mark_password_changed')

      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="p-5">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-teal-accent">
          <Check className="h-4 w-4" />
          Password updated.
        </p>
        <p className="mt-1 text-xs text-navy-500">
          Use it next time you sign in — here and in any other Prime Time tool you have access to.
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold text-navy-600 transition-colors hover:bg-navy-100"
        >
          Change it again
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-3 p-5">
      <p className="text-xs text-navy-500">
        Signed in as <span className="font-mono text-navy-700">{user.email}</span>. This is the
        same login for every Prime Time tool, so changing it here changes it everywhere.
      </p>

      <Field label="Current password">
        <input
          type={reveal ? 'text' : 'password'}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          className={INPUT}
        />
      </Field>

      <Field label={`New password — at least ${MIN_LENGTH} characters`}>
        <div className="relative">
          <input
            type={reveal ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={`${INPUT} pr-9`}
          />
          {/* A reveal toggle, not a strength meter. Typing a long password blind is the actual
              reason people pick short ones. */}
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide passwords' : 'Show passwords'}
            className="absolute inset-y-0 right-2 flex items-center text-navy-400 transition-colors hover:text-navy-700"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      <Field label="Confirm new password">
        <input
          type={reveal ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className={INPUT}
        />
      </Field>

      {tooShort && <Note>{MIN_LENGTH - next.length} more characters needed.</Note>}
      {mismatch && <Note>The two new passwords do not match.</Note>}
      {sameAsOld && <Note>That is the password you already have.</Note>}
      {error && <Note>{error}</Note>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-navy-50 transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <KeyRound className="h-4 w-4" />
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  )
}

const INPUT =
  'w-full rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-900 focus:border-amber-accent focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-navy-400">
        {label}
      </span>
      {children}
    </label>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-coral-accent">{children}</p>
}
