import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import Facturas from './pages/Facturas'
import NuevaFactura from './pages/NuevaFactura'
import Configuracion from './pages/Configuracion'
import Tickets from './pages/Tickets'
import Presupuestos from './pages/Presupuestos'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  // Pantalla de carga inicial
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
          <span className="text-sm text-gray-500">Iniciando...</span>
        </div>
      </div>
    )
  }

  // Sin sesión → Login
  if (!session) return <Login onLogin={() => {}} />

  // Con sesión → App completa
  return (
    <Layout session={session}>
      <Routes>
        <Route path="/"              element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"     element={<Dashboard session={session} />} />
        <Route path="/clientes"      element={<Clientes session={session} />} />
        <Route path="/facturas"      element={<Facturas session={session} />} />
        <Route path="/facturas/nueva"element={<NuevaFactura session={session} />} />
        <Route path="/tickets"        element={<Tickets session={session} />} />
        <Route path="/presupuestos"    element={<Presupuestos session={session} />} />
        <Route path="/configuracion" element={<Configuracion session={session} />} />
        <Route path="*"              element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}
