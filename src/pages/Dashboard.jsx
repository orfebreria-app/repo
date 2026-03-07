import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, getEmpresa, getFacturas, formatEuro, formatFecha } from '../lib/supabase'

// ── helpers ───────────────────────────────────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const hoy   = new Date()

const estadoBadge = (e) => ({
  pagada:    'bg-green-900/50 text-green-400 border-green-800',
  emitida:   'bg-blue-900/50 text-blue-400 border-blue-800',
  borrador:  'bg-gray-800 text-gray-400 border-gray-700',
  vencida:   'bg-red-900/50 text-red-400 border-red-800',
  cancelada: 'bg-gray-800/50 text-gray-600 border-gray-800',
}[e] || 'bg-gray-800 text-gray-400')

const diasDesde = (fecha) =>
  Math.floor((hoy - new Date(fecha)) / (1000 * 60 * 60 * 24))

// ── componente principal ──────────────────────────────────
export default function Dashboard({ session }) {
  const [empresa,  setEmpresa]  = useState(null)
  const [facturas, setFacturas] = useState([])
  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) {
        const { data: facts } = await getFacturas(emp.id)
        setFacturas(facts || [])
        const { data: ticks } = await supabase
          .from('tickets')
          .select('*, lineas_ticket(*)')
          .eq('empresa_id', emp.id)
          .order('creado_en', { ascending: false })
        setTickets(ticks || [])
      }
      setLoading(false)
    }
    load()
  }, [session])

  if (loading) return <LoadingSkeleton />

  // ── KPIs mes actual ────────────────────────────────────
  const mesActual  = hoy.getMonth()
  const anioActual = hoy.getFullYear()
  const mesPasado  = mesActual === 0 ? 11 : mesActual - 1
  const anioPasado = mesActual === 0 ? anioActual - 1 : anioActual

  const ventasMes = (mes, anio) => {
    const facTotal = facturas
      .filter(f => f.estado !== 'cancelada' && f.estado !== 'borrador')
      .filter(f => { const d = new Date(f.fecha_emision); return d.getMonth()===mes && d.getFullYear()===anio })
      .reduce((s,f) => s + Number(f.total), 0)
    const tickTotal = tickets
      .filter(t => { const d = new Date(t.creado_en); return d.getMonth()===mes && d.getFullYear()===anio })
      .reduce((s,t) => s + Number(t.total), 0)
    return +(facTotal + tickTotal).toFixed(2)
  }

  const totalMesActual  = ventasMes(mesActual, anioActual)
  const totalMesPasado  = ventasMes(mesPasado, anioPasado)
  const variacion       = totalMesPasado > 0 ? ((totalMesActual - totalMesPasado) / totalMesPasado * 100).toFixed(1) : null

  const porCobrar = facturas.filter(f => f.estado==='emitida').reduce((s,f) => s+Number(f.total),0)
  const vencidas  = facturas.filter(f => f.estado==='vencida')
  const facMes    = facturas.filter(f => { const d=new Date(f.fecha_emision); return d.getMonth()===mesActual && d.getFullYear()===anioActual })

  // ── Datos gráfico (últimos 7 meses) ───────────────────
  const ultimos7 = Array.from({length:7},(_,i) => {
    const d = new Date(anioActual, mesActual - (6-i), 1)
    const m = d.getMonth(), a = d.getFullYear()
    return { label: MESES[m], total: ventasMes(m, a) }
  })
  const maxBar = Math.max(...ultimos7.map(x => x.total), 1)

  // ── Artículos más vendidos (tickets) ──────────────────
  const conteoArticulos = {}
  tickets.forEach(t => {
    (t.lineas_ticket || []).forEach(l => {
      const k = l.descripcion?.trim()
      if (!k) return
      if (!conteoArticulos[k]) conteoArticulos[k] = { unidades: 0, total: 0 }
      conteoArticulos[k].unidades += Number(l.cantidad)
      conteoArticulos[k].total    += Number(l.subtotal)
    })
  })
  const topArticulos = Object.entries(conteoArticulos)
    .map(([nombre, d]) => ({ nombre, ...d }))
    .sort((a,b) => b.total - a.total)
    .slice(0, 5)

  // ── Cobros pendientes ──────────────────────────────────
  const pendientes = facturas
    .filter(f => f.estado === 'emitida' || f.estado === 'vencida')
    .sort((a,b) => new Date(a.fecha_vencimiento||a.fecha_emision) - new Date(b.fecha_vencimiento||b.fecha_emision))

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {empresa ? `Hola, ${empresa.nombre} 👋` : '¡Bienvenido!'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {hoy.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/presupuestos" className="btn-secondary text-sm">📋 Presupuesto</Link>
          <Link to="/facturas/nueva" className="btn-primary text-sm">+ Nueva Factura</Link>
        </div>
      </div>

      {!empresa && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4 text-sm text-yellow-400 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div><strong>Configura tu empresa antes de empezar.</strong>{' '}
            <Link to="/configuracion" className="underline hover:text-yellow-300">Ir a Configuración →</Link>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon="💰" label={`Ventas ${MESES[mesActual]}`} value={formatEuro(totalMesActual)} color="text-brand-500"
          sub={variacion !== null ? (
            <span className={variacion >= 0 ? 'text-green-400' : 'text-red-400'}>
              {variacion >= 0 ? '▲' : '▼'} {Math.abs(variacion)}% vs mes anterior
            </span>
          ) : null}
        />
        <KPI icon="⏳" label="Por cobrar" value={formatEuro(porCobrar)} color="text-yellow-400"
          sub={pendientes.length > 0 ? <span className="text-gray-500">{pendientes.length} factura{pendientes.length!==1?'s':''}</span> : null}
        />
        <KPI icon="📄" label="Facturas este mes" value={facMes.length} color="text-blue-400" />
        <KPI icon="⚠️" label="Facturas vencidas" value={vencidas.length}
          color={vencidas.length > 0 ? 'text-red-400' : 'text-gray-500'}
          sub={vencidas.length > 0 ? <span className="text-red-500">{formatEuro(vencidas.reduce((s,f)=>s+Number(f.total),0))}</span> : null}
        />
      </div>

      {/* Gráfico + Top artículos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Gráfico ventas 7 meses */}
        <div className="lg:col-span-2 card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">📈 Ventas últimos 7 meses</h2>
            <span className="text-xs text-gray-500">Facturas + Tickets</span>
          </div>
          <div className="flex items-end gap-2 h-40 pt-2">
            {ultimos7.map((m, i) => {
              const pct = maxBar > 0 ? (m.total / maxBar) * 100 : 0
              const esActual = i === 6
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {formatEuro(m.total)}
                  </div>
                  <div className="w-full flex items-end" style={{ height: '100px' }}>
                    <div
                      className={`w-full rounded-t-md transition-all duration-500 ${esActual ? 'bg-brand-500' : 'bg-gray-700 group-hover:bg-gray-600'}`}
                      style={{ height: `${Math.max(pct, m.total > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <div className={`text-xs font-medium ${esActual ? 'text-brand-500' : 'text-gray-500'}`}>{m.label}</div>
                </div>
              )
            })}
          </div>
          {/* Comparativa */}
          <div className="border-t border-gray-800 pt-3 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Este mes</div>
              <div className="font-bold text-white text-lg">{formatEuro(totalMesActual)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mes anterior</div>
              <div className="font-bold text-gray-400 text-lg">{formatEuro(totalMesPasado)}</div>
            </div>
            {variacion !== null && (
              <div className="col-span-2">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold
                  ${Number(variacion) >= 0 ? 'bg-green-900/30 text-green-400 border border-green-800/40' : 'bg-red-900/30 text-red-400 border border-red-800/40'}`}>
                  {Number(variacion) >= 0 ? '▲' : '▼'} {Math.abs(variacion)}% respecto al mes anterior
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top artículos */}
        <div className="card space-y-4">
          <h2 className="font-bold text-white">🏆 Más vendidos</h2>
          {topArticulos.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-sm">
              <div className="text-3xl mb-2">📦</div>
              Todavía sin datos de tickets
            </div>
          ) : (
            <div className="space-y-3">
              {topArticulos.map((a, i) => {
                const pct = topArticulos[0].total > 0 ? (a.total / topArticulos[0].total) * 100 : 0
                const colores = ['bg-brand-500','bg-blue-500','bg-purple-500','bg-orange-500','bg-pink-500']
                return (
                  <div key={a.nombre} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-600">#{i+1}</span>
                        <span className="text-sm text-gray-300 truncate max-w-[130px]">{a.nombre}</span>
                      </div>
                      <span className="text-xs text-gray-500">{formatEuro(a.total)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colores[i]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-gray-600">{a.unidades % 1 === 0 ? a.unidades : a.unidades.toFixed(1)} unidades</div>
                  </div>
                )
              })}
            </div>
          )}
          <Link to="/tickets" className="text-xs text-brand-500 hover:underline block text-center pt-1">
            Ver historial completo →
          </Link>
        </div>
      </div>

      {/* Cobros pendientes y vencidas */}
      {pendientes.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">🔔 Estado de cobros</h2>
            <Link to="/facturas" className="text-xs text-brand-500 hover:underline">Ver todas →</Link>
          </div>

          {/* Alerta vencidas */}
          {vencidas.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚨</span>
                <div>
                  <div className="text-red-400 font-semibold text-sm">
                    {vencidas.length} factura{vencidas.length!==1?'s':''} vencida{vencidas.length!==1?'s':''}
                  </div>
                  <div className="text-red-600 text-xs">Total pendiente: {formatEuro(vencidas.reduce((s,f)=>s+Number(f.total),0))}</div>
                </div>
              </div>
              <Link to="/facturas" className="text-xs bg-red-800/50 hover:bg-red-700/50 text-red-300 px-3 py-1.5 rounded-lg transition-colors">
                Gestionar →
              </Link>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Factura','Cliente','Fecha emisión','Vencimiento','Días','Total','Estado'].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendientes.slice(0,8).map(f => {
                  const dias = f.fecha_vencimiento ? diasDesde(f.fecha_vencimiento) : null
                  const urgente = dias !== null && dias > 0
                  return (
                    <tr key={f.id} className={`border-b border-gray-800/50 transition-colors ${urgente ? 'bg-red-900/5 hover:bg-red-900/10' : 'hover:bg-gray-800/30'}`}>
                      <td className="py-2.5 px-3 font-mono text-gray-300 text-xs">{f.folio}</td>
                      <td className="py-2.5 px-3 text-gray-200 font-medium">{f.clientes?.nombre||'—'}</td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs">{formatFecha(f.fecha_emision)}</td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs">{f.fecha_vencimiento ? formatFecha(f.fecha_vencimiento) : '—'}</td>
                      <td className="py-2.5 px-3 text-xs">
                        {dias !== null ? (
                          <span className={`font-semibold ${dias > 30 ? 'text-red-400' : dias > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                            {dias > 0 ? `+${dias}d` : `${Math.abs(dias)}d`}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">{formatEuro(f.total)}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${estadoBadge(f.estado)}`}>
                          {f.estado}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pendientes.length > 8 && (
            <p className="text-xs text-gray-600 text-center pt-1">
              +{pendientes.length-8} más — <Link to="/facturas" className="text-brand-500 hover:underline">ver todas</Link>
            </p>
          )}
        </div>
      )}

      {/* Últimas facturas */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">Últimas facturas</h2>
          <Link to="/facturas" className="text-xs text-brand-500 hover:underline">Ver todas →</Link>
        </div>
        {facturas.length === 0 ? (
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
                  {['Folio','Cliente','Fecha','Total','Estado'].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facturas.slice(0,6).map(f => (
                  <tr key={f.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-gray-300 text-xs">{f.folio}</td>
                    <td className="py-2.5 px-3 text-gray-200">{f.clientes?.nombre||'—'}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">{formatFecha(f.fecha_emision)}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">{formatEuro(f.total)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${estadoBadge(f.estado)}`}>
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

function KPI({ icon, label, value, color, sub }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xl">{icon}</span>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-xs mt-0.5">{sub}</div>}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 bg-gray-800 rounded-lg w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_,i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 h-64 bg-gray-800 rounded-xl" />
        <div className="h-64 bg-gray-800 rounded-xl" />
      </div>
      <div className="h-48 bg-gray-800 rounded-xl" />
    </div>
  )
}
