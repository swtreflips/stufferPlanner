import { useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AccountMenu from '../components/layout/AccountMenu'
import PoSyncPanel from '../features/sync/PoSyncPanel'
import ClosedLinesPanel from '../features/sync/ClosedLinesPanel'
import CapacityPanel from '../features/settings/CapacityPanel'
import { useAuth } from '../auth/AuthProvider'
import logoUrl from '../assets/logo.png'

/**
 * Settings — administration, deliberately away from the board.
 *
 * Loading the week's ERP export is not planning work. Putting it on the main screen would sit a
 * button that can close two hundred PO lines next to the drag handles people use all day. It
 * lives behind the account menu instead, which is also where RatesApp keeps its account-level
 * actions, so the gesture is the same across both apps.
 *
 * THE REDIRECT IS NOT THE SECURITY BOUNDARY. `sync_po_lines`, `planner_sync_preview` and
 * `confirm_po_line_closure` each check `my_org_type() = 'internal'` themselves and raise
 * otherwise. This only spares a supplier a page full of controls that would all fail — which is
 * a courtesy, and stated as one so nobody later mistakes it for the thing keeping them out.
 *
 * No planner store here. Settings reads its own data through the repository, so opening it never
 * refetches the board or holds the grid's state in memory behind it.
 */
export default function SettingsPage() {
  const { user } = useAuth()

  /*
    A sync that closes lines changes what the panel below it should say, and the two panels have
    no other connection — each loads its own data once on mount. Without this counter the page
    contradicted itself out loud: "1 closed" in the result, "No closed lines. Everything the ERP
    has ever sent is still open." directly beneath it.

    A counter rather than a callback into the child, because the only thing the closures list
    needs to know is THAT something happened, not what.
  */
  const [syncedAt, setSyncedAt] = useState(0)

  if (user.role !== 'internal' && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-navy-50">
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-navy-200">
        <div className="flex items-center gap-4">
          <img src={logoUrl} alt="Prime Time Packaging" className="h-11 w-auto" />
          <Link
            to="/"
            className="flex items-center gap-1.5 h-7 px-2.5 rounded text-[10px] font-mono uppercase tracking-widest text-navy-600 border border-navy-200 hover:bg-navy-100 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to board
          </Link>
        </div>
        <AccountMenu />
      </header>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">
          <div>
            <h1 className="text-xl font-semibold text-navy-900">Settings</h1>
            <p className="mt-1 text-sm text-navy-500">
              Internal administration. Nothing here is visible to suppliers.
            </p>
          </div>

          <Section
            title="PO data"
            description="The weekly export from NetSuite. Every upload is previewed before anything is written."
          >
            <PoSyncPanel onApplied={() => setSyncedAt((n) => n + 1)} />
          </Section>

          <Section
            title="Closed lines"
            description="PO lines that left the export. The reason is the sync's guess until someone confirms it."
          >
            <ClosedLinesPanel refreshToken={syncedAt} />
          </Section>

          <Section
            title="Container capacity"
            description="How much CBM each container type actually takes. Adjust as loading experience says otherwise."
          >
            <CapacityPanel canEdit />
          </Section>
        </div>
      </main>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-navy-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-navy-100">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        <p className="mt-0.5 text-xs text-navy-500">{description}</p>
      </div>
      {children}
    </section>
  )
}
