import { Loader2 } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useRole } from './auth/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import { AppLayout } from './layout/AppLayout'
import { AccuracyPage } from './pages/AccuracyPage'
import { DashboardPage } from './pages/DashboardPage'
import { ExceptionsPage } from './pages/ExceptionsPage'
import { LoginPage } from './pages/LoginPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { ReceivingPage } from './pages/ReceivingPage'

function Routed() {
  const { user, booting, can } = useRole()

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }
  if (!user) return <LoginPage />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/exceptions" element={<ExceptionsPage />} />
        <Route path="/accuracy" element={<AccuracyPage />} />
        <Route
          path="/receiving"
          element={can('receiving:read') ? <ReceivingPage /> : <Navigate to="/" replace />}
        />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routed />
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
