import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from '../lib/supabase'

const NAV = [
  { to: '/dashboard',     icon: '📊', label: 'Dashboard' },
  { to: '/facturas',      icon: '🧾', label: 'Facturas' },
  { to: '/presupuestos',  icon: '📋', label: 'Presupuestos' },
  { to: '/tickets',       icon: '🏪', label: 'Caja / Tickets' },
  { to: '/clientes',      icon: '👥', label: 'Clientes' },
  { to: '/configuracion', icon: '⚙️', label: 'Configuración' },
]

export default function Layout({ children, session }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-950">

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-gray-900 border-r border-gray-800 z-30 flex flex-col
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Logo */}
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-gray-950 font-bold text-sm">F</div>
            <div>
              <div className="text-sm font-bold text-white">FacturaApp</div>
              <div className="text-xs text-gray-500 font-mono">{session.user.email}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                 ${isActive
                   ? 'bg-brand-500/10 text-brand-500 border border-brand-500/20'
                   : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'}`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Botón nueva factura */}
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={() => { navigate('/facturas/nueva'); setSidebarOpen(false) }}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <span>+</span> Nueva Factura
          </button>
        </div>

        {/* Sign out */}
        <div className="p-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors w-full px-3 py-2"
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar móvil */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white p-1"
          >
            ☰
          </button>
          <span className="font-bold text-sm text-white">FacturaApp</span>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-8">
          {children}
        </main>
      </div>

    </div>
  )
}
