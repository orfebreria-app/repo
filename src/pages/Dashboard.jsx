import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmpresa, getFacturas, formatEuro, formatFecha } from '../lib/supabase'

const estadoBadge = (e) => ({
  pagada:    'badge-pagada',
  emitida:   'badge-emitida',
  borrador:  'badge-borrador',
  vencida:   'badge-vencida',
  cancelada: 'badge-cancelada',
}[e] || 'badge-borrador')

export default function Dashboard({ session }) {
  const [empresa, setEmpresa]   = useState(null)
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) {
        const { data: facts } = await getFacturas(emp.id)
        setFacturas(facts)
      }
      setLoading(false)
    }
    load()
  }, [session])

  if (loading) return <LoadingSkeleton />

  // KPIs
  const mes = new Date().getMonth()
  const anio = new Date().getFullYear()
  const facMes = facturas.filter(f => {
    const d = new Date(f.fecha_emision)
    return d.getMonth() === mes && d.getFullYear() === anio
  })
  const ingresosMes = facMes.filter(f => f.estado !== 'cancelada').reduce((s, f) => s + Number(f.total), 0)
  const porCobrar   = facturas.filter(f => f.estado === 'emitida').reduce((s, f) => s + Number(f.total), 0)
  const vencidas    = facturas.filter(f => f.estado === 'vencida').length
  const ultimas     = facturas.slice(0, 5)

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Bienvenida */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {empresa ? `Hola, ${empresa.nombre}` : '¡Bienvenido!'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        <Link to="/facturas/nueva" className="btn-primary flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Nueva Factura
        </Link>
      </div>

      {/* Aviso sin empresa */}
      {!empresa && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4 text-sm text-yellow-400 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <strong>Configura tu empresa antes de empezar.</strong>{' '}
            <Link to="/configuracion" className="underline hover:text-yellow-300">
              Ir a Configuración →
            </Link>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon="💰" label="Ingresos este mes" value={formatEuro(ingresosMes)} color="text-brand-500" />
        <KPI icon="⏳" label="Por cobrar" value={formatEuro(porCobrar)} color="text-yellow-400" />
        <KPI icon="📄" label="Facturas este mes" value={facMes.length} color="text-blue-400" />
        <KPI icon="⚠️" label="Facturas vencidas" value={vencidas} color={vencidas > 0 ? 'text-red-400' : 'text-gray-500'} />
      </div>

      {/* Últimas facturas */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">Últimas facturas</h2>
          <Link to="/facturas" className="text-xs text-brand-500 hover:underline">Ver todas →</Link>
        </div>

        {ultimas.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <div className="text-4xl mb-3">🧾</div>
            <p className="text-sm">Todavía no hay facturas.</p>
            <Link to="/facturas/nueva" className="text-brand-500 text-sm hover:underline mt-1 inline-block">Crea tu primera factura</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Folio</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Cliente</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Fecha</th>
                  <th className="text-right py-2 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Total</th>
                  <th className="text-center py-2 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ultimas.map(f => (
                  <tr key={f.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-gray-300 text-xs">{f.folio}</td>
                    <td className="py-2.5 px-3 text-gray-200">{f.clientes?.nombre || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">{formatFecha(f.fecha_emision)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-white">{formatEuro(f.total)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoBadge(f.estado)}`}>
                        {f.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function KPI({ icon, label, value, color }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xl">{icon}</span>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 bg-gray-800 rounded-lg w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-800 rounded-xl" />)}
      </div>
      <div className="h-64 bg-gray-800 rounded-xl" />
    </div>
  )
}
