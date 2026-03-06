import { useEffect, useState, useRef } from 'react'
import { supabase, getEmpresa, formatEuro } from '../lib/supabase'
import { generarTicketPDF } from '../lib/ticketPDF'

const IVA_OPCIONES = [0, 4, 10, 21]
const METODOS = [
  { id: 'efectivo',      label: 'Efectivo',     icon: '💵' },
  { id: 'tarjeta',       label: 'Tarjeta',       icon: '💳' },
  { id: 'bizum',         label: 'Bizum',         icon: '📱' },
  { id: 'transferencia', label: 'Transferencia', icon: '🏦' },
]

const ARTICULOS_RAPIDOS = [
  'Trofeo', 'Medalla', 'Placa grabada', 'Grabación láser',
  'Peana', 'Figura', 'Copa', 'Escudo', 'Llavero grabado', 'Placa conmemorativa',
]

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  cantidad: 1,
  precio_con_iva: '',
  iva_tasa: 21,
})

// Precio introducido ya incluye IVA
const calcLinea = (l) => {
  const totalLinea = +(Number(l.precio_con_iva || 0) * Number(l.cantidad)).toFixed(2)
  const divisor    = 1 + Number(l.iva_tasa) / 100
  const base       = +(totalLinea / divisor).toFixed(2)
  const ivaImporte = +(totalLinea - base).toFixed(2)
  return { base, ivaImporte, totalLinea }
}

export default function Tickets({ session }) {
  const [empresa,   setEmpresa]   = useState(null)
  const [lineas,    setLineas]    = useState([lineaVacia()])
  const [metodo,    setMetodo]    = useState('efectivo')
  const [efectivo,  setEfectivo]  = useState('')
  const [notas,     setNotas]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [historial, setHistorial] = useState([])
  const [tab,       setTab]       = useState('caja')
  const [ticketOk,  setTicketOk]  = useState(null)
  const descRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) cargarHistorial(emp.id)
    }
    init()
  }, [session])

  const cargarHistorial = async (empresaId) => {
    const { data } = await supabase
      .from('tickets')
      .select('*, lineas_ticket(*)')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: false })
      .limit(50)
    setHistorial(data || [])
  }

  const totalGeneral = lineas.reduce((s, l) => s + calcLinea(l).totalLinea, 0)
  const baseGeneral  = lineas.reduce((s, l) => s + calcLinea(l).base, 0)
  const ivaGeneral   = +(totalGeneral - baseGeneral).toFixed(2)
  const cambio       = metodo === 'efectivo' && efectivo ? +(Number(efectivo) - totalGeneral).toFixed(2) : 0

  const addLinea    = () => { setLineas(l => [...l, lineaVacia()]); setTimeout(() => descRef.current?.focus(), 50) }
  const removeLinea = (id) => lineas.length > 1 && setLineas(l => l.filter(x => x._id !== id))
  const updateLinea = (id, field, value) => setLineas(l => l.map(x => x._id === id ? { ...x, [field]: value } : x))

  const addArticuloRapido = (nombre) => {
    const ultima = lineas[lineas.length - 1]
    if (!ultima.descripcion) updateLinea(ultima._id, 'descripcion', nombre)
    else setLineas(l => [...l, { ...lineaVacia(), descripcion: nombre }])
  }

  const handleCobrar = async () => {
    if (!empresa) return alert('Configura tu empresa primero')
    if (lineas.some(l => !l.descripcion.trim() || !l.precio_con_iva)) return alert('Completa todos los artículos')
    if (totalGeneral <= 0) return alert('El total debe ser mayor que 0')
    setSaving(true)
    const numero = empresa.siguiente_ticket || 1

    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        empresa_id:         empresa.id,
        numero,
        subtotal:           +baseGeneral.toFixed(2),
        iva_total:          ivaGeneral,
        total:              +totalGeneral.toFixed(2),
        metodo_pago:        metodo,
        efectivo_entregado: metodo === 'efectivo' && efectivo ? Number(efectivo) : null,
        cambio:             metodo === 'efectivo' && efectivo ? cambio : null,
        notas:              notas || null,
      })
      .select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    await supabase.from('lineas_ticket').insert(
      lineas.map((l, i) => {
        const { totalLinea } = calcLinea(l)
        return {
          ticket_id:       ticket.id,
          descripcion:     l.descripcion,
          cantidad:        Number(l.cantidad),
          precio_unitario: Number(l.precio_con_iva),
          iva_tasa:        Number(l.iva_tasa),
          subtotal:        totalLinea,
          orden:           i,
        }
      })
    )

    await supabase.from('empresas').update({ siguiente_ticket: numero + 1 }).eq('id', empresa.id)
    setEmpresa(e => ({ ...e, siguiente_ticket: numero + 1 }))
    setTicketOk({ ...ticket, lineas_ticket: lineas })
    await cargarHistorial(empresa.id)
    setSaving(false)
  }

  const nuevaVenta = () => {
    setLineas([lineaVacia()])
    setMetodo('efectivo')
    setEfectivo('')
    setNotas('')
    setTicketOk(null)
  }

  const descargarPDF = async (ticket, lineasTicket) => {
    const doc = await generarTicketPDF({ ticket, empresa, lineas: lineasTicket })
    doc.save(`ticket-${String(ticket.numero).padStart(6,'0')}.pdf`)
  }

  // ── Pantalla cobrado ──────────────────────────────────
  if (ticketOk) {
    return (
      <div className="max-w-sm mx-auto mt-10 text-center space-y-5">
        <div className="text-6xl animate-bounce">✅</div>
        <h2 className="text-2xl font-bold text-white">¡Cobrado!</h2>
        <div className="card space-y-3 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Ticket nº</span>
            <span className="font-mono text-white">#{String(ticketOk.numero).padStart(6,'0')}</span>
          </div>
          <div className="flex justify-between items-center border-b border-gray-800 pb-3">
            <div>
              <div className="font-bold text-white text-base">TOTAL</div>
              <div className="text-xs text-gray-500">IVA incluido</div>
            </div>
            <span className="font-bold text-brand-500 text-2xl">{formatEuro(ticketOk.total)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Base imponible</span><span>{formatEuro(ticketOk.subtotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>IVA</span><span>{formatEuro(ticketOk.iva_total)}</span>
          </div>
          {ticketOk.metodo_pago === 'efectivo' && ticketOk.cambio > 0 && (
            <div className="flex justify-between items-center bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2 mt-1">
              <span className="text-yellow-400 font-semibold text-sm">💰 Cambio a devolver</span>
              <span className="font-bold text-yellow-300 text-xl">{formatEuro(ticketOk.cambio)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={() => descargarPDF(ticketOk, ticketOk.lineas_ticket)} className="btn-primary flex items-center justify-center gap-2 py-3">
            🖨️ Descargar ticket PDF
          </button>
          <button onClick={nuevaVenta} className="btn-secondary py-3">➕ Nueva venta</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">🏆 Caja / Tickets</h1>
          <p className="text-xs text-gray-500 mt-1">
            Ticket nº #{String(empresa?.siguiente_ticket || 1).padStart(6,'0')} · {new Date().toLocaleDateString('es-ES')} · Precios con IVA incluido
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('caja')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab==='caja' ? 'bg-brand-500 text-gray-950' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            🏪 Caja
          </button>
          <button onClick={() => { setTab('historial'); cargarHistorial(empresa?.id) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab==='historial' ? 'bg-brand-500 text-gray-950' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            📋 Historial
          </button>
        </div>
      </div>

      {tab === 'caja' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Artículos */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-white">Artículos</h2>
                <button onClick={addLinea} className="text-xs text-brand-500 hover:text-brand-600 font-semibold">+ Añadir artículo</button>
              </div>

              <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg px-3 py-2 text-xs text-blue-300">
                💡 Introduce los precios <strong>con IVA incluido</strong> — el desglose fiscal se calcula solo
              </div>

              <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase tracking-wide font-semibold pb-1 border-b border-gray-800">
                <div className="col-span-5">Descripción</div>
                <div className="col-span-2 text-right">Cant.</div>
                <div className="col-span-2 text-right">Precio c/IVA</div>
                <div className="col-span-1 text-right">IVA %</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1"/>
              </div>

              {lineas.map((l, idx) => {
                const { totalLinea } = calcLinea(l)
                return (
                  <div key={l._id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 md:col-span-5">
                      <input
                        ref={idx === lineas.length - 1 ? descRef : null}
                        className="input text-sm"
                        placeholder="Ej: Trofeo grabado personalizado"
                        value={l.descripcion}
                        onChange={e => updateLinea(l._id, 'descripcion', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addLinea()}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <input className="input text-right text-sm" type="number" min="0.001" step="0.001"
                        value={l.cantidad} onChange={e => updateLinea(l._id, 'cantidad', e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <input className="input text-right text-sm" type="number" min="0" step="0.01"
                        placeholder="0.00 €" value={l.precio_con_iva}
                        onChange={e => updateLinea(l._id, 'precio_con_iva', e.target.value)} />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <select className="input text-xs text-right px-1" value={l.iva_tasa}
                        onChange={e => updateLinea(l._id, 'iva_tasa', e.target.value)}>
                        {IVA_OPCIONES.map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                    </div>
                    <div className="col-span-1 text-right text-sm font-semibold text-white hidden md:block">
                      {formatEuro(totalLinea)}
                    </div>
                    <div className="col-span-2 md:col-span-1 flex justify-center">
                      <button onClick={() => removeLinea(l._id)} disabled={lineas.length === 1}
                        className="text-gray-600 hover:text-red-400 text-xl leading-none disabled:opacity-20">×</button>
                    </div>
                  </div>
                )
              })}

              <div className="pt-2 border-t border-gray-800">
                <div className="text-xs text-gray-600 mb-2 uppercase tracking-wide">Acceso rápido</div>
                <div className="flex flex-wrap gap-2">
                  {ARTICULOS_RAPIDOS.map(item => (
                    <button key={item} onClick={() => addArticuloRapido(item)}
                      className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-all">
                      🏆 {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <label className="label">Notas del ticket (opcional)</label>
              <input className="input text-sm" placeholder="Ej: Grabación personalizada, entrega en 3 días..."
                value={notas} onChange={e => setNotas(e.target.value)} />
            </div>
          </div>

          {/* Panel cobro */}
          <div className="space-y-4">
            <div className="card space-y-2">
              <h2 className="font-bold text-white mb-3">Resumen</h2>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Base imponible</span><span>{formatEuro(baseGeneral)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>IVA</span><span>{formatEuro(ivaGeneral)}</span>
              </div>
              <div className="border-t border-gray-700 pt-3 mt-1 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white text-base">TOTAL</div>
                  <div className="text-xs text-gray-500">IVA incluido</div>
                </div>
                <span className="font-bold text-brand-500 text-2xl">{formatEuro(totalGeneral)}</span>
              </div>
            </div>

            <div className="card space-y-3">
              <h2 className="font-bold text-white">Forma de pago</h2>
              <div className="grid grid-cols-2 gap-2">
                {METODOS.map(m => (
                  <button key={m.id} onClick={() => setMetodo(m.id)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition-all
                      ${metodo === m.id ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500'}`}>
                    <span className="text-xl">{m.icon}</span>{m.label}
                  </button>
                ))}
              </div>
              {metodo === 'efectivo' && (
                <div className="space-y-2 pt-1">
                  <label className="label">Efectivo entregado</label>
                  <input className="input text-right text-lg font-bold" type="number" min="0" step="0.01"
                    placeholder={formatEuro(totalGeneral)} value={efectivo}
                    onChange={e => setEfectivo(e.target.value)} />
                  {efectivo && cambio >= 0 && (
                    <div className="flex justify-between items-center bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2">
                      <span className="text-yellow-400 text-sm font-semibold">💰 Cambio</span>
                      <span className="text-yellow-300 font-bold text-xl">{formatEuro(cambio)}</span>
                    </div>
                  )}
                  {efectivo && cambio < 0 && (
                    <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-red-400 text-xs text-center">
                      ⚠️ Efectivo insuficiente
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={handleCobrar}
              disabled={saving || totalGeneral <= 0 || (metodo === 'efectivo' && efectivo && cambio < 0)}
              className="w-full py-4 rounded-xl font-bold text-lg bg-brand-500 hover:bg-brand-600 text-gray-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {saving
                ? <><span className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"/>Procesando...</>
                : <><span className="text-2xl">💰</span>Cobrar {formatEuro(totalGeneral)}</>}
            </button>
            <button onClick={nuevaVenta} className="btn-secondary w-full text-sm">🗑 Limpiar y empezar de nuevo</button>
          </div>
        </div>
      )}

      {tab === 'historial' && (
        <div className="card p-0 overflow-hidden">
          {historial.length === 0 ? (
            <div className="text-center py-16 text-gray-600"><div className="text-4xl mb-3">🧾</div><p className="text-sm">Todavía no hay tickets.</p></div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-800 bg-gray-800/30 flex flex-wrap gap-6 text-sm">
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Tickets hoy</div>
                  <div className="font-bold text-white text-lg">{historial.filter(t => new Date(t.creado_en).toDateString() === new Date().toDateString()).length}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Recaudado hoy</div>
                  <div className="font-bold text-brand-500 text-lg">
                    {formatEuro(historial.filter(t => new Date(t.creado_en).toDateString() === new Date().toDateString()).reduce((s,t) => s + Number(t.total), 0))}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Total tickets</div>
                  <div className="font-bold text-white text-lg">{historial.length}</div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Nº','Fecha','Hora','Artículos','Método','Total (IVA incl.)',''].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map(t => {
                    const fecha = new Date(t.fecha)
                    return (
                      <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-gray-300">#{String(t.numero).padStart(6,'0')}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{fecha.toLocaleDateString('es-ES')}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{fecha.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{t.lineas_ticket?.length || 0} art.</td>
                        <td className="py-3 px-4">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 capitalize">
                            {METODOS.find(m => m.id === t.metodo_pago)?.icon} {t.metodo_pago}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-white">{formatEuro(t.total)}</td>
                        <td className="py-3 px-4">
                          <button onClick={() => descargarPDF(t, t.lineas_ticket || [])}
                            className="text-xs text-gray-500 hover:text-brand-500 transition-colors px-2 py-1 rounded hover:bg-gray-800">
                            🖨️ PDF
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}
