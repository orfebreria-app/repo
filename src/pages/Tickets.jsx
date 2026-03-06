import { useEffect, useState, useRef } from 'react'
import { supabase, getEmpresa, formatEuro } from '../lib/supabase'
import { generarTicketPDF } from '../lib/ticketPDF'

const IVA_OPCIONES = [0, 4, 10, 21]
const METODOS = [
  { id: 'efectivo',      label: 'Efectivo',       icon: '💵' },
  { id: 'tarjeta',       label: 'Tarjeta',         icon: '💳' },
  { id: 'bizum',         label: 'Bizum',           icon: '📱' },
  { id: 'transferencia', label: 'Transferencia',   icon: '🏦' },
]

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  cantidad: 1,
  precio_unitario: '',
  iva_tasa: 21,
})

const calcSubtotal = (l) => +(Number(l.cantidad) * Number(l.precio_unitario || 0)).toFixed(2)

export default function Tickets({ session }) {
  const [empresa,  setEmpresa]  = useState(null)
  const [lineas,   setLineas]   = useState([lineaVacia()])
  const [metodo,   setMetodo]   = useState('efectivo')
  const [efectivo, setEfectivo] = useState('')
  const [notas,    setNotas]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [historial,setHistorial]= useState([])
  const [tab,      setTab]      = useState('caja') // 'caja' | 'historial'
  const [ticketOk, setTicketOk] = useState(null)   // ticket recién guardado
  const descRef = useRef(null)

  // ── Cargar empresa e historial ──────────────────────
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

  // ── Totales ─────────────────────────────────────────
  const subtotal = lineas.reduce((s, l) => s + calcSubtotal(l), 0)
  const ivaTotal = lineas.reduce((s, l) => {
    return s + +(calcSubtotal(l) * (Number(l.iva_tasa) / 100)).toFixed(2)
  }, 0)
  const total  = +(subtotal + ivaTotal).toFixed(2)
  const cambio = metodo === 'efectivo' && efectivo ? +(Number(efectivo) - total).toFixed(2) : 0

  // ── Líneas ──────────────────────────────────────────
  const addLinea    = () => { setLineas(l => [...l, lineaVacia()]); setTimeout(() => descRef.current?.focus(), 50) }
  const removeLinea = (id) => lineas.length > 1 && setLineas(l => l.filter(x => x._id !== id))
  const updateLinea = (id, field, value) => setLineas(l => l.map(x => x._id === id ? { ...x, [field]: value } : x))

  // ── Guardar ticket ───────────────────────────────────
  const handleCobrar = async () => {
    if (!empresa) return alert('Configura tu empresa primero')
    if (lineas.some(l => !l.descripcion.trim() || !l.precio_unitario)) return alert('Completa todos los artículos')
    if (total <= 0) return alert('El total debe ser mayor que 0')

    setSaving(true)
    const numero = empresa.siguiente_ticket || 1

    // Insertar ticket
    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        empresa_id: empresa.id,
        numero,
        subtotal,
        iva_total: ivaTotal,
        total,
        metodo_pago: metodo,
        efectivo_entregado: metodo === 'efectivo' && efectivo ? Number(efectivo) : null,
        cambio: metodo === 'efectivo' && efectivo ? cambio : null,
        notas: notas || null,
      })
      .select()
      .single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // Insertar líneas
    await supabase.from('lineas_ticket').insert(
      lineas.map((l, i) => ({
        ticket_id: ticket.id,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario),
        iva_tasa: Number(l.iva_tasa),
        subtotal: calcSubtotal(l),
        orden: i,
      }))
    )

    // Incrementar siguiente_ticket
    await supabase
      .from('empresas')
      .update({ siguiente_ticket: numero + 1 })
      .eq('id', empresa.id)

    setEmpresa(e => ({ ...e, siguiente_ticket: numero + 1 }))
    setTicketOk({ ...ticket, lineas_ticket: lineas })
    await cargarHistorial(empresa.id)
    setSaving(false)
  }

  // ── Nueva venta ──────────────────────────────────────
  const nuevaVenta = () => {
    setLineas([lineaVacia()])
    setMetodo('efectivo')
    setEfectivo('')
    setNotas('')
    setTicketOk(null)
  }

  // ── Descargar PDF ────────────────────────────────────
  const descargarPDF = async (ticket, lineasTicket) => {
    const doc = await generarTicketPDF({
      ticket,
      empresa,
      lineas: lineasTicket,
    })
    doc.save(`ticket-${String(ticket.numero).padStart(6, '0')}.pdf`)
  }

  // ── PANTALLA TICKET COBRADO ──────────────────────────
  if (ticketOk) {
    return (
      <div className="max-w-sm mx-auto mt-10 text-center space-y-5">
        <div className="text-6xl animate-bounce">✅</div>
        <h2 className="text-2xl font-bold text-white">¡Cobrado!</h2>
        <div className="card space-y-2 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Ticket nº</span>
            <span className="font-mono text-white">{String(ticketOk.numero).padStart(6,'0')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total</span>
            <span className="font-bold text-brand-500 text-lg">{formatEuro(ticketOk.total)}</span>
          </div>
          {ticketOk.metodo_pago === 'efectivo' && ticketOk.cambio > 0 && (
            <div className="flex justify-between text-sm bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2 mt-2">
              <span className="text-yellow-400 font-semibold">💰 Cambio a devolver</span>
              <span className="font-bold text-yellow-300 text-lg">{formatEuro(ticketOk.cambio)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => descargarPDF(ticketOk, ticketOk.lineas_ticket)}
            className="btn-primary flex items-center justify-center gap-2 py-3"
          >
            🖨️ Descargar ticket PDF
          </button>
          <button onClick={nuevaVenta} className="btn-secondary py-3">
            ➕ Nueva venta
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">🏪 Caja / Tickets</h1>
          <p className="text-xs text-gray-500 mt-1">
            Ticket nº {String(empresa?.siguiente_ticket || 1).padStart(6, '0')} · {new Date().toLocaleDateString('es-ES')}
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

      {/* ─── TAB CAJA ─── */}
      {tab === 'caja' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Artículos (2/3) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-white">Artículos</h2>
                <button onClick={addLinea} className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1 font-semibold">
                  + Añadir artículo
                </button>
              </div>

              {/* Cabecera */}
              <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase tracking-wide font-semibold pb-1 border-b border-gray-800">
                <div className="col-span-5">Descripción</div>
                <div className="col-span-2 text-right">Cant.</div>
                <div className="col-span-2 text-right">Precio</div>
                <div className="col-span-1 text-right">IVA</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1"/>
              </div>

              {lineas.map((l, idx) => (
                <div key={l._id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 md:col-span-5">
                    <input
                      ref={idx === lineas.length - 1 ? descRef : null}
                      className="input text-sm"
                      placeholder="Descripción del artículo"
                      value={l.descripcion}
                      onChange={e => updateLinea(l._id, 'descripcion', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addLinea()}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <input
                      className="input text-right text-sm"
                      type="number" min="0.001" step="0.001"
                      value={l.cantidad}
                      onChange={e => updateLinea(l._id, 'cantidad', e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <input
                      className="input text-right text-sm"
                      type="number" min="0" step="0.01"
                      placeholder="0.00"
                      value={l.precio_unitario}
                      onChange={e => updateLinea(l._id, 'precio_unitario', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <select className="input text-xs text-right px-1"
                      value={l.iva_tasa}
                      onChange={e => updateLinea(l._id, 'iva_tasa', e.target.value)}>
                      {IVA_OPCIONES.map(v => <option key={v} value={v}>{v}%</option>)}
                    </select>
                  </div>
                  <div className="col-span-1 text-right text-sm font-semibold text-white hidden md:block">
                    {formatEuro(calcSubtotal(l))}
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-center">
                    <button onClick={() => removeLinea(l._id)}
                      disabled={lineas.length === 1}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xl leading-none disabled:opacity-20">
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {/* Botones rápidos de artículos frecuentes */}
              <div className="pt-2 border-t border-gray-800">
                <div className="text-xs text-gray-600 mb-2 uppercase tracking-wide">Acceso rápido</div>
                <div className="flex flex-wrap gap-2">
                  {['Café', 'Refresco', 'Agua', 'Menú del día', 'Cerveza'].map(item => (
                    <button
                      key={item}
                      onClick={() => {
                        const ultima = lineas[lineas.length - 1]
                        if (!ultima.descripcion) {
                          updateLinea(ultima._id, 'descripcion', item)
                        } else {
                          setLineas(l => [...l, { ...lineaVacia(), descripcion: item }])
                        }
                      }}
                      className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-all"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="card">
              <label className="label">Notas del ticket (opcional)</label>
              <input className="input text-sm" placeholder="Ej: Mesa 5, llevar para llevar..."
                value={notas} onChange={e => setNotas(e.target.value)} />
            </div>
          </div>

          {/* Panel cobro (1/3) */}
          <div className="space-y-4">

            {/* Totales */}
            <div className="card space-y-2">
              <h2 className="font-bold text-white mb-3">Resumen</h2>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-200">{formatEuro(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">IVA</span>
                <span className="text-gray-200">{formatEuro(ivaTotal)}</span>
              </div>
              <div className="border-t border-gray-700 pt-3 mt-1 flex justify-between items-center">
                <span className="font-bold text-white text-base">TOTAL</span>
                <span className="font-bold text-brand-500 text-2xl">{formatEuro(total)}</span>
              </div>
            </div>

            {/* Método de pago */}
            <div className="card space-y-3">
              <h2 className="font-bold text-white">Forma de pago</h2>
              <div className="grid grid-cols-2 gap-2">
                {METODOS.map(m => (
                  <button key={m.id} onClick={() => setMetodo(m.id)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition-all
                      ${metodo === m.id
                        ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500'}`}>
                    <span className="text-xl">{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Efectivo entregado */}
              {metodo === 'efectivo' && (
                <div className="space-y-2 pt-1">
                  <label className="label">Efectivo entregado</label>
                  <input
                    className="input text-right text-lg font-bold"
                    type="number" min="0" step="0.01"
                    placeholder={formatEuro(total)}
                    value={efectivo}
                    onChange={e => setEfectivo(e.target.value)}
                  />
                  {efectivo && cambio >= 0 && (
                    <div className="flex justify-between items-center bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2">
                      <span className="text-yellow-400 text-sm font-semibold">💰 Cambio</span>
                      <span className="text-yellow-300 font-bold text-xl">{formatEuro(cambio)}</span>
                    </div>
                  )}
                  {efectivo && cambio < 0 && (
                    <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-red-400 text-xs text-center">
                      ⚠️ El efectivo entregado es insuficiente
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Botón cobrar */}
            <button
              onClick={handleCobrar}
              disabled={saving || total <= 0 || (metodo === 'efectivo' && efectivo && cambio < 0)}
              className="w-full py-4 rounded-xl font-bold text-lg bg-brand-500 hover:bg-brand-600 text-gray-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving
                ? <><span className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"/> Procesando...</>
                : <><span className="text-2xl">💰</span> Cobrar {formatEuro(total)}</>
              }
            </button>

            <button onClick={nuevaVenta} className="btn-secondary w-full text-sm">
              🗑 Limpiar y empezar de nuevo
            </button>
          </div>
        </div>
      )}

      {/* ─── TAB HISTORIAL ─── */}
      {tab === 'historial' && (
        <div className="card p-0 overflow-hidden">
          {historial.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <div className="text-4xl mb-3">🧾</div>
              <p className="text-sm">Todavía no hay tickets.</p>
            </div>
          ) : (
            <>
              {/* Resumen del día */}
              <div className="p-4 border-b border-gray-800 bg-gray-800/30">
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <div className="text-gray-500 text-xs uppercase tracking-wide">Tickets hoy</div>
                    <div className="font-bold text-white text-lg">
                      {historial.filter(t => new Date(t.creado_en).toDateString() === new Date().toDateString()).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs uppercase tracking-wide">Recaudado hoy</div>
                    <div className="font-bold text-brand-500 text-lg">
                      {formatEuro(historial
                        .filter(t => new Date(t.creado_en).toDateString() === new Date().toDateString())
                        .reduce((s, t) => s + Number(t.total), 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs uppercase tracking-wide">Total tickets</div>
                    <div className="font-bold text-white text-lg">{historial.length}</div>
                  </div>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Nº Ticket','Fecha','Hora','Artículos','Método','Total',''].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map(t => {
                    const fecha = new Date(t.fecha)
                    return (
                      <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-gray-300">
                          #{String(t.numero).padStart(6,'0')}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {fecha.toLocaleDateString('es-ES')}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {t.lineas_ticket?.length || 0} art.
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 capitalize">
                            {METODOS.find(m => m.id === t.metodo_pago)?.icon} {t.metodo_pago}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-white">{formatEuro(t.total)}</td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => descargarPDF(t, t.lineas_ticket || [])}
                            className="text-xs text-gray-500 hover:text-brand-500 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                          >
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
