import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import AppLayout from './components/layout/AppLayout'

const SettingsPage = lazy(() => import('./pages/SettingsPage'))

/**
 * The board is the app, and "/" is where it lives.
 *
 * There used to be three routes — /admin, /internal and /factory/:supplierSlug — because the URL
 * WAS the identity: the old AuthProvider read the path and handed back a matching sample
 * profile. That is gone. Identity comes from the session and `profiles`, so a role in the path
 * is at best noise and at worst a lie. Signing in as a supplier and landing on /admin says
 * something false about who you are, and invites the reasonable assumption that editing the path
 * changes what you can see. It does not — RLS decides, server-side — but a URL that looks like a
 * permission is a URL someone will try, and "it looks like it worked" is its own kind of bug.
 *
 * /settings does NOT reintroduce that. It names a DESTINATION, not a role: every user resolves
 * to the same identity there, and what the page contains is decided by `profiles` once they
 * arrive, never by the path they typed. A supplier who guesses the URL is redirected back here,
 * and the sync functions behind it refuse anyone who is not internal regardless — so the
 * redirect is a courtesy, not the boundary.
 *
 * Everything else redirects rather than 404s, so old bookmarks and /factory/apple links still
 * land somewhere real.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<AppLayout />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
