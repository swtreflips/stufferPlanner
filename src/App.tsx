import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import AppLayout from './components/layout/AppLayout'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/admin" element={<AppLayout />} />
          <Route path="/internal" element={<AppLayout />} />
          <Route path="/factory" element={<Navigate to="/factory/ditar" replace />} />
          <Route path="/factory/:supplierSlug" element={<AppLayout />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
