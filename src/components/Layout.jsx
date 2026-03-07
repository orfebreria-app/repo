import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut, getEmpresa } from '../lib/supabase'

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
  const [empresa, setEmpresa] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    getEmpresa(session.user.id).then(({ data }) => setEmpresa(data))
  }, [session])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-950">

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed top-0 left-0 h-full w-60 z-30 flex flex-col
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `} style={{ background: '#100f0d', borderRight: '1px solid #2a2418' }}>
        {/* Logo empresa */}
        <div className="p-4 flex flex-col items-center gap-2" style={{ borderBottom: '1px solid #2a2418' }}>
          {empresa?.logo_url ? (
            <img
              src={empresa.logo_url}
              alt={empresa.nombre}
              className="max-h-20 max-w-[160px] w-auto h-auto object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 w-full">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#C9A84C,#a8882e)', color: '#1a1400' }}>F</div>
              <div>
                <div className="text-sm font-bold text-white">{empresa?.nombre || 'FacturaApp'}</div>
                <div className="text-xs text-gray-500 font-mono truncate max-w-[120px]">{session.user.email}</div>
              </div>
            </div>
          )}
          {empresa?.logo_url && (
            <div className="text-xs text-gray-600 font-mono truncate max-w-full text-center">{session.user.email}</div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                 ${isActive
                   ? 'text-yellow-300 border'
                   : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'}`
              }
              style={({ isActive }) => isActive ? {
                background: 'rgba(201,168,76,0.1)',
                borderColor: 'rgba(201,168,76,0.3)'
              } : {}}>
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Botón nueva factura */}
        <div className="p-3" style={{ borderTop: '1px solid #2a2418' }}>
          <button onClick={() => { navigate('/facturas/nueva'); setSidebarOpen(false) }}
            className="btn-primary w-full flex items-center justify-center gap-2">
            <span>+</span> Nueva Factura
          </button>
        </div>

        {/* Sign out */}
        <div className="p-3">
          <button onClick={handleSignOut}
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors w-full px-3 py-2">
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900" style={{ borderBottom: '1px solid #2a2418' }}>
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white p-1">☰</button>
          {empresa?.logo_url
            ? <img src={empresa.logo_url} alt="" className="h-8 w-auto object-contain" />
            : <span className="font-bold text-sm text-white">{empresa?.nombre || 'FacturaApp'}</span>
          }
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
