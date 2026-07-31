import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Settings, User } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import type { Role } from '../../types/profile'

/**
 * Account control, top right. Mirrors RatesApp's TopNav so the two apps feel like one system —
 * same shape, same order, same red sign-out at the bottom behind a divider — rendered in the
 * planner's navy palette rather than RatesApp's harbor/fog.
 *
 * It is also the only place the planner states WHO you are. That matters more here than it
 * looks: the role used to be visible in the URL, so /factory/apple told you where you stood.
 * With the path collapsed to "/", an ambient identity indicator is the replacement — without
 * one, a supplier and an internal user see the same chrome over very different data.
 */

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  internal: 'Internal',
  factory: 'Supplier',
}

export default function AccountMenu() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  // Fall back through name → email → 'Account'. A profile with no full_name is normal for a
  // freshly created supplier login, and an empty avatar reads as a broken app.
  const displayName = user.displayName || user.email || 'Account'
  const initials =
    displayName
      .split(/[\s@.]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'

  // A supplier's own company name is the more useful label; internal staff get the role.
  const subtitle =
    user.role === 'factory' ? (user.supplierName ?? ROLE_LABELS.factory) : ROLE_LABELS[user.role]

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded px-1.5 py-1 transition-colors hover:bg-navy-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded bg-navy-900 text-[11px] font-bold text-navy-50">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-navy-900">{displayName}</span>
          <span className="block font-mono text-[10px] uppercase tracking-widest text-navy-400">
            {subtitle}
          </span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-navy-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-navy-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-navy-100 px-3.5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-navy-400">
              Signed in as
            </p>
            <p className="truncate text-sm font-semibold text-navy-900">{displayName}</p>
            {user.email && <p className="truncate text-xs text-navy-500">{user.email}</p>}
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-navy-400">
              {ROLE_LABELS[user.role]}
              {user.supplierName ? ` · ${user.supplierName}` : ''}
            </p>
          </div>

          {/* Placeholders, matching RatesApp. Inert on purpose — a menu item that silently does
              nothing is better than one that navigates to a page that does not exist yet. */}
          <button
            type="button"
            disabled
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-navy-400 cursor-not-allowed"
          >
            <User className="w-[15px] h-[15px]" />
            Profile
          </button>
          <button
            type="button"
            disabled
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-navy-400 cursor-not-allowed"
          >
            <Settings className="w-[15px] h-[15px]" />
            Settings
          </button>

          <div className="my-1 border-t border-navy-100" />
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-coral-accent transition-colors hover:bg-red-50"
          >
            <LogOut className="w-[15px] h-[15px]" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
