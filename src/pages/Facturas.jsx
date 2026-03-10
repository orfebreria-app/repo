import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmpresa, getClientes, getProductos,
         getFacturas, getFactura, updateEstadoFactura, deleteFactura,
         updateFacturaCompleta, tasaRE, formatEuro, formatFecha } from '../lib/supabase'
import ModalPlantilla from '../components/ModalPlantilla'

const ESTADOS = ['todos','borrador','emitida','pagada','vencida','cancelada']
const badge = (e) => ({ pagada:'badge-pagada', emitida:'badge-emitida', borrador:'badge-borrador', vencida:'badge-vencida', cancelada:'badge-cancelada' }[e] || 'badge-borrador')

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '', cantidad: 1, precio_unitario: '', iva_tasa: 21,
  descuento: 0, recargo_tasa: 0, recargo_importe: 0, producto_id: null,
})

const calcLinea = (l) => {
  const base = Number(l.cantidad) * Number(l.precio_unitario || 0)
  const desc = base * (Number(l.descuento) / 100)
  return +(base - desc).toFixed(2)
}

export default function Facturas({ session }) {
  const [empresa,     setEmpresa]     = useState(null)
  const [facturas,    setFacturas]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filtro,      setFiltro]      = useState('todos')
  const [buscar,      setBuscar]      = useState('')
  const [pdfFactura,  setPdfFactura]  = useState(null)
  const [editFactura, setEditFactura] = useState(null)

  const cargar = async (emp) => { const { data } = await getFacturas(emp.id); setFacturas(data) }

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) await cargar(emp)
      setLoading(false)
    }
    init()
  }, [session])

  const handleEstado  = async (id, estado) => { await updateEstadoFactura(id, estado); await cargar(empresa) }
  const handleDelete  = async (id) => { if (!confirm('¿Eliminar esta factura?')) return; await deleteFactura(id); await cargar(empresa) }
  const handlePDF     = async (id) => { const { data } = await getFactura(id); if (data) setPdfFactura(data) }
  const handleEdit    = async (id) => { const { data } = await getFactura(id); if (data) setEditFactura(data) }

  const filtradas = facturas
    .filter(f => filtro === 'todos' || f.estado === filtro)
    .filter(f => f.folio.toLowerCase().includes(buscar.toLowerCase()) || (f.clientes?.nombre || '').toLowerCase().includes(buscar.toLowerCase()))

  if (loading) return <Skeleton />

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Facturas</h1>
        <Link to="/facturas/nueva" className="btn-primary flex items-center gap-2">+ Nueva Factura</Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        {ESTADOS.map(e => (
          <button key={e} onClick={() => setFiltro(e)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize
              ${filtro === e ? 'bg-brand-500 text-gray-950' : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'}`}>
            {e === 'todos' ? 'Todas' : e}
          </button>
        ))}
      </div>

      <input className="input max-w-sm" placeholder="🔍  Buscar por folio o cliente..."
        value={buscar} onChange={e => setBuscar(e.target.value)} />

      <div className="card p-0 overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">🧾</div>
            <p className="text-sm">{buscar || filtro !== 'todos' ? 'Sin resultados' : 'Aún no hay facturas.'}</p>
            {!buscar && filtro === 'todos' && <Link to="/facturas/nueva" className="text-brand-500 text-sm hover:underline mt-1 inline-block">Crear primera factura</Link>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <Th>Folio</Th><Th>Cliente</Th><Th>Fecha</Th><Th>Vencimiento</Th>
                <Th right>Total</Th><Th center>Estado</Th><Th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map(f => (
                <tr key={f.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-gray-300">{f.folio}</td>
                  <td className="py-3 px-4 text-white font-medium">{f.clientes?.nombre || '—'}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{formatFecha(f.fecha_emision)}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{formatFecha(f.fecha_vencimiento)}</td>
                  <td className="py-3 px-4 text-right font-bold text-white">{formatEuro(f.total)}</td>
                  <td className="py-3 px-4 text-center">
                    <select value={f.estado} onChange={e => handleEstado(f.id, e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border bg-transparent cursor-pointer ${badge(f.estado)}`}>
                      {['borrador','emitida','pagada','vencida','cancelada'].map(s => (
                        <option key={s} value={s} className="bg-gray-900 text-gray-200">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => handleEdit(f.id)}
                        className="text-xs text-gray-500 hover:text-yellow-400 transition-colors px-2 py-1 rounded hover:bg-gray-800">
                        ✏️ Editar
                      </button>
                      <button onClick={() => handlePDF(f.id)}
                        className="text-xs text-gray-500 hover:text-brand-500 transition-colors px-2 py-1 rounded hover:bg-gray-800">
                        📥 PDF
                      </button>
                      <button onClick={() => handleDelete(f.id)}
                        className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800">
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtradas.length > 0 && (
        <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
          <span>{filtradas.length} factura{filtradas.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>Total: <strong className="text-white">{formatEuro(filtradas.reduce((s,f) => s + Number(f.total), 0))}</strong></span>
        </div>
      )}

      {pdfFactura  && <ModalPlantilla factura={pdfFactura} empresa={empresa} onClose={() => setPdfFactura(null)} />}
      {editFactura && empresa && (
        <ModalEditarFactura
          factura={editFactura} empresa={empresa}
          onClose={() => setEditFactura(null)}
          onSaved={() => { setEditFactura(null); cargar(empresa) }}
        />
      )}
    </div>
  )
}

// ── Modal Editar Factura ────────────────────────────────
function ModalEditarFactura({ factura, empresa, onClose, onSaved }) {
  const [clientes,    setClientes]    = useState([])
  const [productos,   setProductos]   = useState([])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [busqProd,    setBusqProd]    = useState('')
  const [lineaActiva, setLineaActiva] = useState(null)
  const [clienteRE,   setClienteRE]   = useState(!!factura.clientes?.recargo_equivalencia)

  const [form, setForm] = useState({
    folio:             factura.folio,
    cliente_id:        factura.cliente_id,
    fecha_emision:     factura.fecha_emision?.slice(0,10) || '',
    fecha_vencimiento: factura.fecha_vencimiento?.slice(0,10) || '',
    estado:            factura.estado,
    notas:             factura.notas || '',
  })

  const [lineas, setLineas] = useState(
    (factura.conceptos_factura || [])
      .sort((a,b) => a.orden - b.orden)
      .map(c => ({
        _id:             c.id,
        descripcion:     c.descripcion,
        cantidad:        c.cantidad,
        precio_unitario: c.precio_unitario,
        iva_tasa:        c.iva_tasa,
        descuento:       c.descuento || 0,
        recargo_tasa:    c.recargo_tasa || 0,
        recargo_importe: c.recargo_importe || 0,
        producto_id:     c.producto_id || null,
      }))
  )

  useEffect(() => {
    getClientes(empresa.id).then(({ data }) => setClientes(data || []))
    getProductos(empresa.id).then(({ data }) => setProductos(data || []))
  }, [empresa.id])

  const addLinea    = () => setLineas(l => [...l, lineaVacia()])
  const removeLinea = (id) => lineas.length > 1 && setLineas(l => l.filter(x => x._id !== id))
  const updateLinea = (id, field, val) => setLineas(l => l.map(x => x._id === id ? {...x, [field]: val} : x))

  const prodsFiltrados = busqProd.length > 1
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqProd.toLowerCase()) || (p.referencia||'').toLowerCase().includes(busqProd.toLowerCase()))
    : []

  const seleccionarProd = (prod, lineaId) => {
    setLineas(l => l.map(x => x._id === lineaId ? {
      ...x, descripcion: prod.nombre,
      precio_unitario: prod.precio_venta || '',
      iva_tasa: prod.iva_tasa || 21,
      recargo_tasa: clienteRE ? tasaRE(prod.iva_tasa || 21) : 0,
      producto_id: prod.id,
    } : x))
    setBusqProd(''); setLineaActiva(null)
  }

  const subtotal = lineas.reduce((s, l) => s + calcLinea(l), 0)
  const ivaTotal = lineas.reduce((s, l) => s + +(calcLinea(l) * Number(l.iva_tasa) / 100).toFixed(2), 0)
  const reTotal  = lineas.reduce((s, l) => s + +(calcLinea(l) * Number(l.recargo_tasa || 0) / 100).toFixed(2), 0)
  const total    = +(subtotal + ivaTotal + reTotal).toFixed(2)

  const handleSave = async () => {
    setError('')
    if (!form.folio.trim())   return setError('El número de factura es obligatorio')
    if (!form.cliente_id)     return setError('Selecciona un cliente')
    if (lineas.some(l => !l.descripcion.trim() || !l.precio_unitario)) return setError('Completa todos los conceptos')

    setSaving(true)
    const cabecera = {
      folio: form.folio.trim(), cliente_id: form.cliente_id,
      fecha_emision: form.fecha_emision,
      fecha_vencimiento: form.fecha_vencimiento || null,
      estado: form.estado, notas: form.notas || null,
      subtotal, iva_total: ivaTotal, recargo_total: reTotal, total,
    }
    const conceptosNuevos = lineas.map(l => {
      const base = calcLinea(l)
      return {
        descripcion: l.descripcion, cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario), iva_tasa: Number(l.iva_tasa),
        descuento: Number(l.descuento || 0),
        recargo_tasa: Number(l.recargo_tasa || 0),
        recargo_importe: +(base * Number(l.recargo_tasa || 0) / 100).toFixed(2),
        subtotal: base, producto_id: l.producto_id || null,
      }
    })

    const { error: err } = await updateFacturaCompleta(
      factura.id, empresa.id, cabecera, conceptosNuevos, factura.conceptos_factura
    )
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-4xl shadow-2xl my-8"
        style={{ background: '#161410', border: '1px solid #2a2418' }}>

        <div className="flex items-center justify-between px-6 py-4 sticky top-0 rounded-t-2xl z-10"
          style={{ background: '#161410', borderBottom: '1px solid #2a2418' }}>
          <div>
            <h3 className="text-lg font-bold text-white">✏️ Editar factura</h3>
            <p className="text-xs text-gray-500 mt-0.5">Los cambios en artículos actualizan el stock automáticamente</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Cabecera */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Nº Factura *</label>
              <input className="input font-mono" value={form.folio}
                onChange={e => setForm(f => ({...f, folio: e.target.value}))} />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className="label">Cliente *</label>
              <select className="input" value={form.cliente_id}
                onChange={e => {
                  const cli = clientes.find(c => c.id === e.target.value)
                  setClienteRE(!!cli?.recargo_equivalencia)
                  setForm(f => ({...f, cliente_id: e.target.value}))
                }}>
                <option value="">— Selecciona —</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.recargo_equivalencia ? ' (RE)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fecha emisión</label>
              <input type="date" className="input" value={form.fecha_emision}
                onChange={e => setForm(f => ({...f, fecha_emision: e.target.value}))} />
            </div>
            <div>
              <label className="label">Fecha vencimiento</label>
              <input type="date" className="input" value={form.fecha_vencimiento}
                onChange={e => setForm(f => ({...f, fecha_vencimiento: e.target.value}))} />
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={form.estado} onChange={e => setForm(f => ({...f, estado: e.target.value}))}>
                {['borrador','emitida','pagada','vencida','cancelada'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {clienteRE && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#C9A84C' }}>
              ⚠️ Cliente con <strong>Recargo de Equivalencia</strong> — actívalo por línea pulsando el botón RE
            </div>
          )}

          {/* Conceptos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-sm">Conceptos</h4>
              <button type="button" onClick={addLinea} className="text-xs font-semibold" style={{ color: '#C9A84C' }}>+ Añadir concepto</button>
            </div>

            {/* Cabeceras desktop */}
            <div className="hidden md:grid gap-1.5 text-xs text-gray-500 uppercase tracking-wide pb-1"
              style={{ gridTemplateColumns: '2.5fr 0.8fr 1fr 0.6fr 0.5fr 0.6fr 0.7fr 24px', borderBottom: '1px solid #2a2418' }}>
              <div>Descripción</div><div className="text-right">Cant.</div>
              <div className="text-right">Precio</div><div className="text-center">IVA</div>
              <div className="text-center">Dto%</div><div className="text-center">RE</div>
              <div className="text-right">Subtotal</div><div/>
            </div>

            {lineas.map((l) => {
              const busqActiva = lineaActiva === l._id && busqProd.length > 1
              const base = calcLinea(l)
              const reImp = +(base * Number(l.recargo_tasa || 0) / 100).toFixed(2)
              return (
                <div key={l._id} className="hidden md:grid gap-1.5 items-center"
                  style={{ gridTemplateColumns: '2.5fr 0.8fr 1fr 0.6fr 0.5fr 0.6fr 0.7fr 24px' }}>
                  <div className="relative">
                    <input className="input text-sm w-full"
                      placeholder="Descripción o busca catálogo..."
                      value={l.descripcion}
                      onChange={e => {
                        const val = e.target.value
                        updateLinea(l._id, 'descripcion', val)
                        if (val.length > 1) { setBusqProd(val); setLineaActiva(l._id) }
                        else { setBusqProd(''); setLineaActiva(null) }
                      }}
                      onFocus={() => {
                        if (l.descripcion.length > 1) { setBusqProd(l.descripcion); setLineaActiva(l._id) }
                      }}
                      onBlur={() => setTimeout(() => setLineaActiva(null), 200)}
                    />
                    {busqActiva && prodsFiltrados.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 rounded-lg shadow-xl mt-1 overflow-hidden"
                        style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
                        {prodsFiltrados.slice(0, 6).map(p => (
                          <button key={p.id} type="button" onMouseDown={() => seleccionarProd(p, l._id)}
                            className="w-full text-left px-3 py-2 hover:bg-white/5 flex justify-between items-center">
                            <div>
                              <div className="text-sm text-white">{p.nombre}</div>
                              <div className="text-xs text-gray-500">{p.referencia || ''}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold" style={{ color: '#C9A84C' }}>{formatEuro(p.precio_venta)}</div>
                              <div className={`text-xs ${p.stock_actual <= 0 ? 'text-red-400' : 'text-green-400'}`}>Stock: {p.stock_actual}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {l.producto_id && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#C9A84C' }}>📦</span>}
                  </div>
                  <input className="input text-right text-sm" type="number" min="0.001" step="0.001"
                    value={l.cantidad} onChange={e => updateLinea(l._id, 'cantidad', e.target.value)} />
                  <input className="input text-right text-sm" type="number" min="0" step="0.01"
                    value={l.precio_unitario} onChange={e => updateLinea(l._id, 'precio_unitario', e.target.value)} />
                  <select className="input text-xs text-center px-0.5" value={l.iva_tasa}
                    onChange={e => updateLinea(l._id, 'iva_tasa', e.target.value)}>
                    {[0,4,10,21].map(v => <option key={v} value={v}>{v}%</option>)}
                  </select>
                  <input className="input text-right text-xs" type="number" min="0" max="100" step="1"
                    placeholder="0" value={l.descuento || 0}
                    onChange={e => updateLinea(l._id, 'descuento', e.target.value)} />
                  <button type="button"
                    onClick={() => updateLinea(l._id, 'recargo_tasa', Number(l.recargo_tasa||0) > 0 ? 0 : tasaRE(l.iva_tasa))}
                    className="py-1.5 rounded-lg text-xs font-bold border transition-all"
                    style={Number(l.recargo_tasa||0) > 0
                      ? { background:'rgba(201,168,76,0.2)', color:'#C9A84C', borderColor:'rgba(201,168,76,0.5)' }
                      : { background:'transparent', color:'#6b7280', borderColor:'#374151' }}>
                    {Number(l.recargo_tasa||0) > 0 ? `${l.recargo_tasa}%` : 'RE'}
                  </button>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">{formatEuro(base)}</div>
                    {reImp > 0 && <div className="text-xs" style={{ color: '#C9A84C' }}>+{formatEuro(reImp)}</div>}
                  </div>
                  <button type="button" onClick={() => removeLinea(l._id)} disabled={lineas.length === 1}
                    className="text-gray-600 hover:text-red-400 text-lg leading-none disabled:opacity-20">×</button>
                </div>
              )
            })}

            {/* Móvil */}
            <div className="md:hidden space-y-3">
              {lineas.map((l) => (
                <div key={l._id+'_m'} className="card p-3 space-y-2">
                  <input className="input text-sm w-full" placeholder="Descripción..."
                    value={l.descripcion} onChange={e => updateLinea(l._id, 'descripcion', e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <input className="input text-sm text-right" type="number" placeholder="Cant."
                      value={l.cantidad} onChange={e => updateLinea(l._id, 'cantidad', e.target.value)} />
                    <input className="input text-sm text-right" type="number" placeholder="Precio"
                      value={l.precio_unitario} onChange={e => updateLinea(l._id, 'precio_unitario', e.target.value)} />
                    <select className="input text-xs" value={l.iva_tasa} onChange={e => updateLinea(l._id, 'iva_tasa', e.target.value)}>
                      {[0,4,10,21].map(v => <option key={v} value={v}>{v}%</option>)}
                    </select>
                  </div>
                  <div className="flex justify-between">
                    <button type="button"
                      onClick={() => updateLinea(l._id, 'recargo_tasa', Number(l.recargo_tasa||0) > 0 ? 0 : tasaRE(l.iva_tasa))}
                      className="text-xs px-2 py-1 rounded border font-semibold"
                      style={Number(l.recargo_tasa||0) > 0 ? { background:'rgba(201,168,76,0.2)', color:'#C9A84C', borderColor:'rgba(201,168,76,0.5)' } : { color:'#6b7280', borderColor:'#374151' }}>
                      {Number(l.recargo_tasa||0) > 0 ? `✓ RE ${l.recargo_tasa}%` : '+ RE'}
                    </button>
                    <button type="button" onClick={() => removeLinea(l._id)} disabled={lineas.length === 1}
                      className="text-red-400 text-sm disabled:opacity-20">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="label">Notas / Condiciones de pago</label>
            <textarea className="input h-16 resize-none text-sm"
              placeholder="Pago a 30 días · Transferencia bancaria..."
              value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} />
          </div>

          {/* Totales */}
          <div className="flex flex-wrap justify-end gap-5 text-sm p-4 rounded-xl" style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
            <span className="text-gray-400">Subtotal: <strong className="text-white ml-1">{formatEuro(subtotal)}</strong></span>
            <span className="text-gray-400">IVA: <strong className="text-white ml-1">{formatEuro(ivaTotal)}</strong></span>
            {reTotal > 0 && <span style={{ color: '#C9A84C' }}>RE: <strong className="ml-1">{formatEuro(reTotal)}</strong></span>}
            <span className="text-gray-400 font-semibold">TOTAL: <strong className="text-xl ml-2" style={{ color: '#C9A84C' }}>{formatEuro(total)}</strong></span>
          </div>

          {error && <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm p-3 rounded-lg">⚠️ {error}</div>}

          <div className="flex justify-end gap-3 pb-2">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary px-6">
              {saving ? 'Guardando...' : '💾 Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const Th = ({ children, right, center }) => (
  <th className={`py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>{children}</th>
)

const Skeleton = () => (
  <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-32" />
    <div className="flex gap-2">{[...Array(5)].map((_,i) => <div key={i} className="h-7 w-20 bg-gray-800 rounded-full" />)}</div>
    <div className="h-64 bg-gray-800 rounded-xl" />
  </div>
)
