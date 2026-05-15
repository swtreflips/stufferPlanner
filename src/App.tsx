import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import AppLayout from './components/layout/AppLayout'

function RoleRouter() {
  const { role } = useAuth()
  const dest =
    role === 'admin' ? '/admin' : role === 'internal' ? '/internal' : '/factory'
  return <Navigate to={dest} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RoleRouter />} />
          <Route path="/admin" element={<AppLayout />} />
          <Route path="/internal" element={<AppLayout />} />
          <Route path="/factory" element={<AppLayout />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
