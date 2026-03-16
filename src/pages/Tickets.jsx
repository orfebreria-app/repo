import { useEffect, useState, useRef } from 'react'
import { supabase, getEmpresa, getProductos, descontarStockVenta, tasaRE, formatEuro } from '../lib/supabase'
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

const CLAVE_BORRADO = '8323'

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  cantidad: 1,
  precio_con_iva: '',
  iva_tasa: 21,
  producto_id: null,
})

// En tickets el precio YA incluye IVA (y opcionalmente RE)
// RE se aplica sobre la base antes de IVA
const calcLinea = (l, conRE = false) => {
  const totalLinea = +(Number(l.precio_con_iva || 0) * Number(l.cantidad)).toFixed(2)
  const divisor    = 1 + Number(l.iva_tasa) / 100
  const base       = +(totalLinea / divisor).toFixed(2)
  const ivaImporte = +(totalLinea - base).toFixed(2)
  const reImporte  = conRE ? +(base * tasaRE(l.iva_tasa) / 100).toFixed(2) : 0
  return { base, ivaImporte, reImporte, totalLinea: +(totalLinea + reImporte).toFixed(2) }
}

export default function Tickets({ session }) {
  const [empresa,   setEmpresa]   = useState(null)
  const [lineas,    setLineas]    = useState([lineaVacia()])
  const [conRE,     setConRE]     = useState(false)
  const [metodo,    setMetodo]    = useState('efectivo')
  const [efectivo,  setEfectivo]  = useState('')
  const [notas,     setNotas]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [historial, setHistorial] = useState([])
  const [tab,       setTab]       = useState('caja')
  const [ticketOk,  setTicketOk]  = useState(null)
  const [modalBorrar, setModalBorrar] = useState(false)
  const [claveBorrar, setClaveBorrar] = useState('')
  const [errorClave,  setErrorClave]  = useState('')
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [productos, setProductos] = useState([])
  const [busqProducto, setBusqProducto] = useState('')
  const [lineaActivaBusq, setLineaActivaBusq] = useState(null)
  const descRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) {
        cargarHistorial(emp.id)
        const { data: prods } = await getProductos(emp.id)
        setProductos(prods || [])
      }
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

  // Buscar productos del catálogo
  const productosFiltrados = busqProducto.length > 1
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqProducto.toLowerCase()) || (p.referencia||'').toLowerCase().includes(busqProducto.toLowerCase()))
    : []

  const seleccionarProducto = (prod, lineaId) => {
    setLineas(l => l.map(x => x._id === lineaId ? {
      ...x,
      descripcion: prod.nombre,
      precio_con_iva: prod.precio_venta || '',
      iva_tasa: prod.iva_tasa || 21,
      producto_id: prod.id,
    } : x))
    setBusqProducto('')
    setLineaActivaBusq(null)
  }

  const totalGeneral   = lineas.reduce((s, l) => s + calcLinea(l, conRE).totalLinea, 0)
  const baseGeneral    = lineas.reduce((s, l) => s + calcLinea(l, conRE).base, 0)
  const ivaGeneral     = +(lineas.reduce((s, l) => s + calcLinea(l, conRE).ivaImporte, 0)).toFixed(2)
  const reGeneral      = +(lineas.reduce((s, l) => s + calcLinea(l, conRE).reImporte, 0)).toFixed(2)
  const cambio         = metodo === 'efectivo' && efectivo ? +(Number(efectivo) - totalGeneral).toFixed(2) : 0

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
        recargo_total:      reGeneral,
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
        const { totalLinea, reImporte } = calcLinea(l, conRE)
        return {
          ticket_id:       ticket.id,
          descripcion:     l.descripcion,
          cantidad:        Number(l.cantidad),
          precio_unitario: Number(l.precio_con_iva),
          iva_tasa:        Number(l.iva_tasa),
          subtotal:        totalLinea,
          recargo_tasa:    conRE ? tasaRE(l.iva_tasa) : 0,
          recargo_importe: reImporte,
          orden:           i,
          producto_id:     l.producto_id || null,
        }
      })
    )

    // Descontar stock automáticamente
    await descontarStockVenta(empresa.id, lineas, ticket.id, 'ticket')

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
    setConRE(false)
  }

  const descargarPDF = async (ticket, lineasTicket) => {
    const doc = await generarTicketPDF({ ticket, empresa, lineas: lineasTicket })
    doc.save(`ticket-${String(ticket.numero).padStart(6,'0')}.pdf`)
  }

  const imprimirTicket = (ticket, lineasTicket) => {
    const fmt = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
    const fecha = new Date(ticket.creado_en || ticket.fecha)
    const fechaStr = fecha.toLocaleDateString('es-ES')
    const horaStr  = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    const sep = '─'.repeat(32)
    const metodos = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum', transferencia: 'Transferencia' }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 72mm;
    padding: 4mm 3mm;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .sep    { border-top: 1px dashed #000; margin: 4px 0; }
  .sep2   { border-top: 2px solid #000; margin: 4px 0; }
  .row    { display: flex; justify-content: space-between; margin: 2px 0; }
  .big    { font-size: 15px; font-weight: bold; }
  .xl     { font-size: 18px; font-weight: bold; }
  .small  { font-size: 10px; color: #444; }
  .art    { margin: 3px 0; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { width: 80mm; }
  }
</style>
</head>
<body>
  <div class="center bold big">${empresa?.nombre || 'Mi Empresa'}</div>
  ${empresa?.direccion ? `<div class="center small">${empresa.direccion}</div>` : ''}
  ${empresa?.nif_cif   ? `<div class="center small">NIF/CIF: ${empresa.nif_cif}</div>` : ''}
  ${empresa?.telefono  ? `<div class="center small">Tel: ${empresa.telefono}</div>` : ''}
  <div class="sep2"></div>

  <div class="center bold">TICKET Nº ${String(ticket.numero).padStart(6,'0')}</div>
  <div class="row small"><span>Fecha: ${fechaStr}</span><span>Hora: ${horaStr}</span></div>
  <div class="sep"></div>

  ${lineasTicket.map(l => `
  <div class="art">
    <div class="bold">${l.descripcion}</div>
    <div class="row small">
      <span>${l.cantidad} x ${fmt(l.precio_unitario)}</span>
      <span class="bold">${fmt(l.subtotal)}</span>
    </div>
  </div>`).join('')}

  <div class="sep"></div>
  <div class="row small"><span>Subtotal:</span><span>${fmt(ticket.subtotal)}</span></div>
  <div class="row small"><span>IVA:</span><span>${fmt(ticket.iva_total)}</span></div>
  ${ticket.recargo_total > 0 ? `<div class="row small"><span>Rec. Equiv.:</span><span>${fmt(ticket.recargo_total)}</span></div>` : ''}
  <div class="sep2"></div>
  <div class="row xl"><span>TOTAL:</span><span>${fmt(ticket.total)}</span></div>
  <div class="sep2"></div>

  <div class="row small"><span>Forma de pago:</span><span class="bold">${metodos[ticket.metodo_pago] || ticket.metodo_pago}</span></div>
  ${ticket.metodo_pago === 'efectivo' && ticket.efectivo_entregado ? `
  <div class="row small"><span>Entregado:</span><span>${fmt(ticket.efectivo_entregado)}</span></div>
  <div class="row small bold"><span>Cambio:</span><span>${fmt(ticket.cambio || 0)}</span></div>` : ''}

  <div class="sep"></div>
  ${ticket.notas ? `<div class="center small">${ticket.notas}</div><br>` : ''}
  <div class="center bold">¡Gracias por su compra!</div>
  <div class="center small">Conserve este ticket como justificante</div>
  <br><br>
</body>
</html>`

    const ventana = window.open('', '_blank', 'width=300,height=600')
    ventana.document.write(html)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => {
      ventana.print()
      ventana.close()
    }, 400)
  }

  const abrirModalBorrar = (ticket) => {
    setModalBorrar(true)
    setClaveBorrar('')
    setErrorClave('')
  }

  const toggleSeleccion = (id) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleTodos = () => {
    if (seleccionados.size === historial.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(historial.map(t => t.id)))
    }
  }

  const confirmarBorrado = async () => {
    if (claveBorrar !== CLAVE_BORRADO) {
      setErrorClave('Contraseña incorrecta')
      setClaveBorrar('')
      return
    }
    for (const id of seleccionados) {
      await supabase.from('lineas_ticket').delete().eq('ticket_id', id)
      await supabase.from('tickets').delete().eq('id', id)
    }
    setModalBorrar(false)
    setClaveBorrar('')
    setSeleccionados(new Set())
    await cargarHistorial(empresa.id)
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
          <button onClick={() => imprimirTicket(ticketOk, ticketOk.lineas_ticket)}
            className="btn-primary flex items-center justify-center gap-2 py-3 text-base"
            style={{ background: 'linear-gradient(135deg,#C9A84C,#a8882e)', color: '#1a1400' }}>
            🖨️ Imprimir ticket
          </button>
          <button onClick={() => descargarPDF(ticketOk, ticketOk.lineas_ticket)} className="btn-secondary flex items-center justify-center gap-2 py-2 text-sm">
            📄 Descargar PDF
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
          <button onClick={() => { setTab('diaria'); cargarHistorial(empresa?.id) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab==='diaria' ? 'bg-brand-500 text-gray-950' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            📊 Caja diaria
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
                const { totalLinea, reImporte } = calcLinea(l, conRE)
                const busqActiva = lineaActivaBusq === l._id && busqProducto.length > 1
                return (
                  <div key={l._id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 md:col-span-5 relative">
                      <input
                        ref={idx === lineas.length - 1 ? descRef : null}
                        className="input text-sm"
                        placeholder="Ej: Trofeo grabado o busca catálogo..."
                        value={l.descripcion}
                        onChange={e => {
                          const val = e.target.value
                          updateLinea(l._id, 'descripcion', val)
                          if (val.length > 1) { setBusqProducto(val); setLineaActivaBusq(l._id) }
                          else { setBusqProducto(''); setLineaActivaBusq(null) }
                        }}
                        onFocus={() => {
                          if (l.descripcion.length > 1) { setBusqProducto(l.descripcion); setLineaActivaBusq(l._id) }
                        }}
                        onBlur={() => setTimeout(() => setLineaActivaBusq(null), 200)}
                        onKeyDown={e => e.key === 'Enter' && !busqActiva && addLinea()}
                      />
                      {/* Dropdown catálogo */}
                      {busqActiva && productosFiltrados.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-40 rounded-lg shadow-xl mt-1 overflow-hidden"
                          style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
                          {productosFiltrados.slice(0, 6).map(p => (
                            <button key={p.id}
                              onMouseDown={() => seleccionarProducto(p, l._id)}
                              className="w-full text-left px-3 py-2 hover:bg-white/5 flex justify-between items-center gap-2">
                              <div>
                                <div className="text-sm text-white font-medium">{p.nombre}</div>
                                <div className="text-xs text-gray-500">{p.referencia || ''} {p.categoria ? `· ${p.categoria}` : ''}</div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-xs font-bold" style={{ color: '#C9A84C' }}>{formatEuro(p.precio_venta)}</div>
                                <div className={`text-xs ${p.stock_actual <= 0 ? 'text-red-400' : p.stock_actual <= p.stock_minimo ? 'text-yellow-400' : 'text-green-400'}`}>
                                  Stock: {p.stock_actual} {p.unidad}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Badge producto vinculado */}
                      {l.producto_id && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}>
                          📦
                        </span>
                      )}
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
                    <div className="col-span-1 text-right hidden md:block">
                      <div className="text-sm font-semibold text-white">{formatEuro(totalLinea)}</div>
                      {conRE && reImporte > 0 && (
                        <div className="text-xs" style={{ color: '#C9A84C' }}>+{formatEuro(reImporte)} RE</div>
                      )}
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
              {conRE && reGeneral > 0 && (
                <div className="flex justify-between text-xs font-semibold" style={{ color: '#C9A84C' }}>
                  <span>Rec. Equivalencia</span><span>{formatEuro(reGeneral)}</span>
                </div>
              )}
              <div className="border-t border-gray-700 pt-3 mt-1 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white text-base">TOTAL</div>
                  <div className="text-xs text-gray-500">{conRE ? 'IVA + RE incluido' : 'IVA incluido'}</div>
                </div>
                <span className="font-bold text-brand-500 text-2xl">{formatEuro(totalGeneral)}</span>
              </div>

              {/* Toggle Recargo de Equivalencia */}
              <div className="border-t border-gray-700 pt-3 mt-1">
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg transition-all"
                  style={{ background: conRE ? 'rgba(201,168,76,0.08)' : 'transparent', border: `1px solid ${conRE ? 'rgba(201,168,76,0.3)' : '#374151'}` }}>
                  <input type="checkbox" className="w-4 h-4" checked={conRE} onChange={e => setConRE(e.target.checked)} />
                  <div>
                    <div className="text-xs font-semibold" style={{ color: conRE ? '#C9A84C' : '#9ca3af' }}>Rec. Equivalencia</div>
                    <div className="text-xs text-gray-600">21%→+5,2% · 10%→+1,4% · 4%→+0,5%</div>
                  </div>
                </label>
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

              {/* Barra de selección */}
              {seleccionados.size > 0 && (
                <div className="px-4 py-3 bg-red-900/20 border-b border-red-800/40 flex items-center justify-between gap-3">
                  <span className="text-sm text-red-300 font-semibold">
                    🗑 {seleccionados.size} ticket{seleccionados.size !== 1 ? 's' : ''} seleccionado{seleccionados.size !== 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setSeleccionados(new Set())}
                      className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-gray-800 transition-colors">
                      Cancelar
                    </button>
                    <button onClick={() => abrirModalBorrar()}
                      className="text-xs text-white bg-red-700 hover:bg-red-600 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1">
                      🗑 Borrar seleccionados
                    </button>
                  </div>
                </div>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="py-3 px-4 w-10">
                      <input type="checkbox"
                        checked={seleccionados.size === historial.length && historial.length > 0}
                        onChange={toggleTodos}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-brand-500 cursor-pointer"
                      />
                    </th>
                    {['Nº','Fecha','Hora','Artículos','Método','Total (IVA incl.)',''].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map(t => {
                    const fecha = new Date(t.fecha)
                    const seleccionado = seleccionados.has(t.id)
                    return (
                      <tr key={t.id}
                        className={`border-b border-gray-800/50 transition-colors cursor-pointer
                          ${seleccionado ? 'bg-red-900/10 border-red-900/30' : 'hover:bg-gray-800/30'}`}
                        onClick={() => toggleSeleccion(t.id)}
                      >
                        <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                          <input type="checkbox"
                            checked={seleccionado}
                            onChange={() => toggleSeleccion(t.id)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-brand-500 cursor-pointer"
                          />
                        </td>
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
                        <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <button onClick={() => imprimirTicket(t, t.lineas_ticket || [])}
                              className="text-xs text-gray-500 hover:text-green-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                              title="Imprimir en TSC E200">
                              🖨️
                            </button>
                            <button onClick={() => descargarPDF(t, t.lineas_ticket || [])}
                              className="text-xs text-gray-500 hover:text-brand-500 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                              title="Descargar PDF">
                              📄
                            </button>
                          </div>
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

      {/* Modal borrado con contraseña */}
      {modalBorrar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75" onClick={() => setModalBorrar(null)} />
          <div className="relative bg-gray-900 border border-red-800/50 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-2">🔒</div>
              <h3 className="text-lg font-bold text-white">Borrar ticket</h3>
              <p className="text-xs text-gray-500 mt-1">
                Ticket #{String(modalBorrar.numero).padStart(6,'0')} · {formatEuro(modalBorrar.total)}
              </p>
              <p className="text-xs text-red-400 mt-2">Esta acción no se puede deshacer</p>
            </div>

            <div className="space-y-3">
              <label className="label">Introduce la contraseña de borrado</label>
              <input
                className="input text-center text-xl font-mono tracking-widest"
                type="password"
                placeholder="••••"
                value={claveBorrar}
                onChange={e => { setClaveBorrar(e.target.value); setErrorClave('') }}
                onKeyDown={e => e.key === 'Enter' && confirmarBorrado()}
                autoFocus
                maxLength={10}
              />
              {errorClave && (
                <p className="text-red-400 text-sm text-center">⚠️ {errorClave}</p>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setModalBorrar(null)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={confirmarBorrado} className="btn-danger flex-1">
                🗑 Borrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB CAJA DIARIA ─────────────────────────── */}
      {tab === 'diaria' && (
        <CajaDiaria historial={historial} formatEuro={formatEuro} />
      )}
    </div>
  )
}

function CajaDiaria({ historial, formatEuro }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))

  const ticketsDia = historial.filter(t => {
    const d = new Date(t.creado_en).toISOString().slice(0, 10)
    return d === fecha
  })

  const totalDia     = ticketsDia.reduce((s, t) => s + Number(t.total), 0)
  const totalEfectivo = ticketsDia.filter(t => t.metodo_pago === 'efectivo').reduce((s, t) => s + Number(t.total), 0)
  const totalTarjeta  = ticketsDia.filter(t => t.metodo_pago === 'tarjeta').reduce((s, t) => s + Number(t.total), 0)
  const totalBizum    = ticketsDia.filter(t => t.metodo_pago === 'bizum').reduce((s, t) => s + Number(t.total), 0)
  const totalTransf   = ticketsDia.filter(t => t.metodo_pago === 'transferencia').reduce((s, t) => s + Number(t.total), 0)

  // Agrupar artículos vendidos del día
  const articulosDia = {}
  ticketsDia.forEach(t => {
    (t.lineas_ticket || []).forEach(l => {
      const k = l.descripcion
      if (!articulosDia[k]) articulosDia[k] = { cantidad: 0, total: 0 }
      articulosDia[k].cantidad += Number(l.cantidad)
      articulosDia[k].total   += Number(l.subtotal || 0)
    })
  })

  return (
    <div className="space-y-5">
      {/* Selector fecha */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="label">Fecha</label>
          <input type="date" className="input w-auto" value={fecha}
            onChange={e => setFecha(e.target.value)} />
        </div>
        <button onClick={() => setFecha(new Date().toISOString().slice(0,10))}
          className="btn-secondary text-sm mt-4">Hoy</button>
        <button onClick={() => {
          const d = new Date(fecha); d.setDate(d.getDate() - 1)
          setFecha(d.toISOString().slice(0,10))
        }} className="btn-secondary text-sm mt-4">← Ayer</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total caja', valor: formatEuro(totalDia), icon: '💰', gold: true },
          { label: 'Tickets', valor: ticketsDia.length, icon: '🧾' },
          { label: 'Ticket medio', valor: ticketsDia.length ? formatEuro(totalDia / ticketsDia.length) : '—', icon: '📊' },
          { label: 'Efectivo', valor: formatEuro(totalEfectivo), icon: '💵' },
        ].map((k, i) => (
          <div key={i} className="card text-center py-4">
            <div className="text-2xl mb-1">{k.icon}</div>
            <div className={`text-xl font-bold ${k.gold ? 'text-yellow-400' : 'text-white'}`}>{k.valor}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Desglose por forma de pago */}
      <div className="card">
        <h3 className="font-bold text-white mb-3">💳 Por forma de pago</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Efectivo', valor: totalEfectivo, icon: '💵' },
            { label: 'Tarjeta',  valor: totalTarjeta,  icon: '💳' },
            { label: 'Bizum',    valor: totalBizum,    icon: '📱' },
            { label: 'Transf.',  valor: totalTransf,   icon: '🏦' },
          ].map((m, i) => (
            <div key={i} className="rounded-lg p-3 text-center" style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
              <div className="text-xl mb-1">{m.icon}</div>
              <div className="font-bold text-white">{formatEuro(m.valor)}</div>
              <div className="text-xs text-gray-500">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Artículos vendidos */}
      {Object.keys(articulosDia).length > 0 && (
        <div className="card">
          <h3 className="font-bold text-white mb-3">📦 Artículos vendidos</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 px-3 text-xs text-gray-500 uppercase">Artículo</th>
                <th className="text-right py-2 px-3 text-xs text-gray-500 uppercase">Uds.</th>
                <th className="text-right py-2 px-3 text-xs text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(articulosDia).sort((a,b) => b[1].total - a[1].total).map(([desc, dat]) => (
                <tr key={desc} className="border-b border-gray-800/50 hover:bg-white/5">
                  <td className="py-2 px-3 text-white">{desc}</td>
                  <td className="py-2 px-3 text-right text-gray-400">{dat.cantidad}</td>
                  <td className="py-2 px-3 text-right font-mono text-white">{formatEuro(dat.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ticketsDia.length === 0 && (
        <div className="card text-center py-12 text-gray-600">
          <div className="text-4xl mb-3">📭</div>
          <p>No hay tickets para esta fecha</p>
        </div>
      )}
    </div>
  )
}
