import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmpresa, getClientes, getProductos, createFactura, descontarStockVenta, formatEuro } from '../lib/supabase'
import { format, addDays } from 'date-fns'

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  cantidad: 1,
  precio_unitario: '',
  iva_tasa: 21,
  descuento: 0,
  producto_id: null,
})

const calcLinea = (l) => {
  const base = Number(l.cantidad) * Number(l.precio_unitario || 0)
  const desc = base * (Number(l.descuento) / 100)
  return +(base - desc).toFixed(2)
}

export default function NuevaFactura({ session }) {
  const navigate = useNavigate()
  const [empresa,   setEmpresa]   = useState(null)
  const [clientes,  setClientes]  = useState([])
  const [productos, setProductos] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [busqProducto,    setBusqProducto]    = useState('')
  const [lineaActivaBusq, setLineaActivaBusq] = useState(null)

  const hoy = format(new Date(), 'yyyy-MM-dd')
  const [form, setForm] = useState({
    cliente_id: '',
    fecha_emision: hoy,
    fecha_vencimiento: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notas: '',
    estado: 'emitida',
  })
  const [lineas, setLineas] = useState([lineaVacia()])

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) {
        const [{ data: cls }, { data: prods }] = await Promise.all([
          getClientes(emp.id),
          getProductos(emp.id),
        ])
        setClientes(cls)
        setProductos(prods || [])
      }
      setLoading(false)
    }
    init()
  }, [session])

  const subtotal = lineas.reduce((s, l) => s + calcLinea(l), 0)
  const ivaTotal = lineas.reduce((s, l) => {
    const base = calcLinea(l)
    return s + +(base * (Number(l.iva_tasa) / 100)).toFixed(2)
  }, 0)
  const total = +(subtotal + ivaTotal).toFixed(2)

  const addLinea    = () => setLineas([...lineas, lineaVacia()])
  const removeLinea = (id) => lineas.length > 1 && setLineas(lineas.filter(l => l._id !== id))
  const updateLinea = (id, field, value) =>
    setLineas(lineas.map(l => l._id === id ? { ...l, [field]: value } : l))

  const productosFiltrados = busqProducto.length > 1
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqProducto.toLowerCase()) || (p.referencia||'').toLowerCase().includes(busqProducto.toLowerCase()))
    : []

  const seleccionarProducto = (prod, lineaId) => {
    setLineas(l => l.map(x => x._id === lineaId ? {
      ...x,
      descripcion:     prod.nombre,
      precio_unitario: prod.precio_venta || '',
      iva_tasa:        prod.iva_tasa || 21,
      producto_id:     prod.id,
    } : x))
    setBusqProducto('')
    setLineaActivaBusq(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.cliente_id) return setError('Selecciona un cliente')
    if (lineas.some(l => !l.descripcion.trim() || !l.precio_unitario))
      return setError('Completa todos los conceptos')

    setSaving(true)
    const folio = `${empresa.serie}-${String(empresa.siguiente_folio).padStart(4, '0')}`
    const facturaData = {
      empresa_id: empresa.id, cliente_id: form.cliente_id,
      folio, fecha_emision: form.fecha_emision,
      fecha_vencimiento: form.fecha_vencimiento || null,
      estado: form.estado, subtotal, iva_total: ivaTotal, total, notas: form.notas,
    }
    const conceptos = lineas.map(l => ({
      descripcion: l.descripcion, cantidad: Number(l.cantidad),
      precio_unitario: Number(l.precio_unitario), iva_tasa: Number(l.iva_tasa),
      descuento: Number(l.descuento), subtotal: calcLinea(l),
      producto_id: l.producto_id || null,
    }))

    const { data: fact, error: err } = await createFactura(facturaData, conceptos)
    if (err) { setError(err.message); setSaving(false); return }

    // Descontar stock
    await descontarStockVenta(empresa.id, lineas, fact.id, 'factura')

    navigate('/facturas')
  }

  if (loading) return <Skeleton />

  if (!empresa) return (
    <div className="max-w-lg mx-auto mt-10 card text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-gray-400 text-sm">Configura tu empresa antes de crear facturas.</p>
      <button onClick={() => navigate('/configuracion')} className="btn-primary mt-4">Ir a Configuración</button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Nueva Factura</h1>
        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/facturas')} className="btn-secondary">Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '💾 Guardar factura'}
          </button>
        </div>
      </div>

      {/* Datos principales */}
      <div className="card grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <label className="label">Cliente *</label>
          <select className="input" value={form.cliente_id}
            onChange={e => setForm({...form, cliente_id: e.target.value})} required>
            <option value="">— Selecciona un cliente —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {clientes.length === 0 && (
            <p className="text-xs text-yellow-500 mt-1">
              No tienes clientes. <button type="button" onClick={() => navigate('/clientes')} className="underline">Añade uno primero →</button>
            </p>
          )}
        </div>
        <div>
          <label className="label">Fecha de emisión *</label>
          <input type="date" className="input" value={form.fecha_emision}
            onChange={e => setForm({...form, fecha_emision: e.target.value})} required />
        </div>
        <div>
          <label className="label">Fecha de vencimiento</label>
          <input type="date" className="input" value={form.fecha_vencimiento}
            onChange={e => setForm({...form, fecha_vencimiento: e.target.value})} />
        </div>
        <div>
          <label className="label">Estado inicial</label>
          <select className="input" value={form.estado} onChange={e => setForm({...form, estado: e.target.value})}>
            <option value="borrador">Borrador</option>
            <option value="emitida">Emitida</option>
          </select>
        </div>
        <div>
          <label className="label">Folio (automático)</label>
          <div className="input bg-gray-800/50 text-gray-500 select-none font-mono text-xs">
            {empresa.serie}-{String(empresa.siguiente_folio).padStart(4,'0')}
          </div>
        </div>
      </div>

      {/* Conceptos */}
      <div className="card space-y-3">
        <h2 className="font-bold text-white text-base">Conceptos</h2>
        <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase tracking-wide font-semibold pb-1 border-b border-gray-800">
          <div className="col-span-4">Descripción / Producto</div>
          <div className="col-span-2 text-right">Cant.</div>
          <div className="col-span-2 text-right">Precio unit.</div>
          <div className="col-span-1 text-right">IVA %</div>
          <div className="col-span-1 text-right">Dto %</div>
          <div className="col-span-1 text-right">Subtotal</div>
          <div className="col-span-1" />
        </div>

        {lineas.map((l, idx) => {
          const busqActiva = lineaActivaBusq === l._id && busqProducto.length > 1
          return (
            <div key={l._id} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-12 md:col-span-4 relative">
                <input className="input"
                  placeholder={`Concepto ${idx + 1} — o escribe para buscar catálogo`}
                  value={lineaActivaBusq === l._id ? busqProducto : l.descripcion}
                  onChange={e => {
                    if (lineaActivaBusq === l._id) {
                      setBusqProducto(e.target.value)
                    } else {
                      updateLinea(l._id, 'descripcion', e.target.value)
                      if (e.target.value.length > 1) { setLineaActivaBusq(l._id); setBusqProducto(e.target.value) }
                    }
                  }}
                  onFocus={() => { if (l.descripcion.length > 1) { setLineaActivaBusq(l._id); setBusqProducto(l.descripcion) } }}
                  onBlur={() => setTimeout(() => setLineaActivaBusq(null), 200)}
                />
                {busqActiva && productosFiltrados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-40 rounded-lg shadow-xl mt-1 overflow-hidden"
                    style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
                    {productosFiltrados.slice(0, 6).map(p => (
                      <button key={p.id} type="button" onMouseDown={() => seleccionarProducto(p, l._id)}
                        className="w-full text-left px-3 py-2 hover:bg-white/5 flex justify-between items-center gap-2">
                        <div>
                          <div className="text-sm text-white font-medium">{p.nombre}</div>
                          <div className="text-xs text-gray-500">{p.referencia || ''} {p.categoria ? `· ${p.categoria}` : ''}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-bold" style={{ color: '#C9A84C' }}>{formatEuro(p.precio_venta)}</div>
                          <div className={`text-xs ${p.stock_actual <= 0 ? 'text-red-400' : 'text-green-400'}`}>
                            Stock: {p.stock_actual} {p.unidad}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {l.producto_id && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}>📦</span>
                )}
              </div>
              <div className="col-span-4 md:col-span-2">
                <input className="input text-right" type="number" min="0" step="0.001" placeholder="1"
                  value={l.cantidad} onChange={e => updateLinea(l._id, 'cantidad', e.target.value)} />
              </div>
              <div className="col-span-4 md:col-span-2">
                <input className="input text-right" type="number" min="0" step="0.01" placeholder="0.00"
                  value={l.precio_unitario} onChange={e => updateLinea(l._id, 'precio_unitario', e.target.value)} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <select className="input text-right" value={l.iva_tasa}
                  onChange={e => updateLinea(l._id, 'iva_tasa', e.target.value)}>
                  {[0,4,10,21].map(v => <option key={v} value={v}>{v}%</option>)}
                </select>
              </div>
              <div className="col-span-2 md:col-span-1">
                <input className="input text-right" type="number" min="0" max="100" step="1" placeholder="0"
                  value={l.descuento} onChange={e => updateLinea(l._id, 'descuento', e.target.value)} />
              </div>
              <div className="col-span-4 md:col-span-1 flex items-center justify-end">
                <span className="text-sm font-semibold text-white">{formatEuro(calcLinea(l))}</span>
              </div>
              <div className="col-span-2 md:col-span-1 flex items-center justify-center">
                <button type="button" onClick={() => removeLinea(l._id)}
                  className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                  disabled={lineas.length === 1}>×</button>
              </div>
            </div>
          )
        })}

        <button type="button" onClick={addLinea}
          className="text-sm font-semibold transition-colors flex items-center gap-1 mt-2"
          style={{ color: '#C9A84C' }}>
          + Añadir concepto
        </button>
      </div>

      {/* Totales + Notas */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="label">Notas / Condiciones de pago</label>
          <textarea className="input h-24 resize-none"
            placeholder="Ej: Pago a 30 días · Transferencia bancaria · IBAN ES..."
            value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} />
        </div>
        <div className="card space-y-2" style={{ background: '#1a1814' }}>
          <Row label="Subtotal" value={formatEuro(subtotal)} />
          <Row label="IVA" value={formatEuro(ivaTotal)} />
          <div className="border-t pt-2 flex justify-between items-center" style={{ borderColor: '#2a2418' }}>
            <span className="font-bold text-white text-base">TOTAL</span>
            <span className="font-bold text-xl" style={{ color: '#C9A84C' }}>{formatEuro(total)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm p-3 rounded-lg">⚠️ {error}</div>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <button type="button" onClick={() => navigate('/facturas')} className="btn-secondary">Cancelar</button>
        <button type="submit" className="btn-primary px-6" disabled={saving}>
          {saving ? 'Guardando...' : '💾 Guardar factura'}
        </button>
      </div>
    </form>
  )
}

const Row = ({ label, value }) => (
  <div className="flex justify-between text-sm">
    <span className="text-gray-400">{label}</span>
    <span className="text-gray-200">{value}</span>
  </div>
)

const Skeleton = () => (
  <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-40" />
    <div className="h-48 bg-gray-800 rounded-xl" />
    <div className="h-32 bg-gray-800 rounded-xl" />
  </div>
)

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  cantidad: 1,
  precio_unitario: '',
  iva_tasa: 21,
  descuento: 0,
})

const calcLinea = (l) => {
  const base = Number(l.cantidad) * Number(l.precio_unitario || 0)
  const desc = base * (Number(l.descuento) / 100)
  return +(base - desc).toFixed(2)
}

export default function NuevaFactura({ session }) {
  const navigate = useNavigate()
  const [empresa,  setEmpresa]  = useState(null)
  const [clientes, setClientes] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const hoy = format(new Date(), 'yyyy-MM-dd')
  const [form, setForm] = useState({
    cliente_id: '',
    fecha_emision: hoy,
    fecha_vencimiento: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notas: '',
    estado: 'emitida',
  })
  const [lineas, setLineas] = useState([lineaVacia()])

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) {
        const { data: cls } = await getClientes(emp.id)
        setClientes(cls)
      }
      setLoading(false)
    }
    init()
  }, [session])

  // Totales
  const subtotal = lineas.reduce((s, l) => s + calcLinea(l), 0)
  const ivaTotal = lineas.reduce((s, l) => {
    const base = calcLinea(l)
    return s + +(base * (Number(l.iva_tasa) / 100)).toFixed(2)
  }, 0)
  const total = +(subtotal + ivaTotal).toFixed(2)

  const addLinea  = () => setLineas([...lineas, lineaVacia()])
  const removeLinea = (id) => lineas.length > 1 && setLineas(lineas.filter(l => l._id !== id))
  const updateLinea = (id, field, value) =>
    setLineas(lineas.map(l => l._id === id ? { ...l, [field]: value } : l))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.cliente_id) return setError('Selecciona un cliente')
    if (lineas.some(l => !l.descripcion.trim() || !l.precio_unitario))
      return setError('Completa todos los conceptos')

    setSaving(true)
    const folio = `${empresa.serie}-${String(empresa.siguiente_folio).padStart(4, '0')}`
    const facturaData = {
      empresa_id: empresa.id,
      cliente_id: form.cliente_id,
      folio,
      fecha_emision: form.fecha_emision,
      fecha_vencimiento: form.fecha_vencimiento || null,
      estado: form.estado,
      subtotal,
      iva_total: ivaTotal,
      total,
      notas: form.notas,
    }
    const conceptos = lineas.map(l => ({
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad),
      precio_unitario: Number(l.precio_unitario),
      iva_tasa: Number(l.iva_tasa),
      descuento: Number(l.descuento),
      subtotal: calcLinea(l),
    }))

    const { error: err } = await createFactura(facturaData, conceptos)
    if (err) { setError(err.message); setSaving(false); return }

    navigate('/facturas')
  }

  if (loading) return <Skeleton />

  if (!empresa) return (
    <div className="max-w-lg mx-auto mt-10 card text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-gray-400 text-sm">Configura tu empresa antes de crear facturas.</p>
      <button onClick={() => navigate('/configuracion')} className="btn-primary mt-4">
        Ir a Configuración
      </button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Nueva Factura</h1>
        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/facturas')} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '💾 Guardar factura'}
          </button>
        </div>
      </div>

      {/* Datos principales */}
      <div className="card grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Cliente */}
        <div className="md:col-span-2">
          <label className="label">Cliente *</label>
          <select
            className="input"
            value={form.cliente_id}
            onChange={e => setForm({...form, cliente_id: e.target.value})}
            required
          >
            <option value="">— Selecciona un cliente —</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          {clientes.length === 0 && (
            <p className="text-xs text-yellow-500 mt-1">
              No tienes clientes. <button type="button" onClick={() => navigate('/clientes')} className="underline">Añade uno primero →</button>
            </p>
          )}
        </div>

        <div>
          <label className="label">Fecha de emisión *</label>
          <input type="date" className="input" value={form.fecha_emision}
            onChange={e => setForm({...form, fecha_emision: e.target.value})} required />
        </div>
        <div>
          <label className="label">Fecha de vencimiento</label>
          <input type="date" className="input" value={form.fecha_vencimiento}
            onChange={e => setForm({...form, fecha_vencimiento: e.target.value})} />
        </div>

        <div>
          <label className="label">Estado inicial</label>
          <select className="input" value={form.estado}
            onChange={e => setForm({...form, estado: e.target.value})}>
            <option value="borrador">Borrador</option>
            <option value="emitida">Emitida</option>
          </select>
        </div>

        <div>
          <label className="label">Folio (automático)</label>
          <div className="input bg-gray-800/50 text-gray-500 select-none font-mono text-xs">
            {empresa.serie}-{String(empresa.siguiente_folio).padStart(4,'0')}
          </div>
        </div>
      </div>

      {/* Conceptos */}
      <div className="card space-y-3">
        <h2 className="font-bold text-white text-base">Conceptos</h2>

        {/* Cabecera tabla */}
        <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase tracking-wide font-semibold pb-1 border-b border-gray-800">
          <div className="col-span-4">Descripción</div>
          <div className="col-span-2 text-right">Cant.</div>
          <div className="col-span-2 text-right">Precio unit.</div>
          <div className="col-span-1 text-right">IVA %</div>
          <div className="col-span-1 text-right">Dto %</div>
          <div className="col-span-1 text-right">Subtotal</div>
          <div className="col-span-1" />
        </div>

        {lineas.map((l, idx) => (
          <div key={l._id} className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-12 md:col-span-4">
              <input
                className="input"
                placeholder={`Concepto ${idx + 1}`}
                value={l.descripcion}
                onChange={e => updateLinea(l._id, 'descripcion', e.target.value)}
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <input
                className="input text-right"
                type="number" min="0" step="0.001"
                placeholder="1"
                value={l.cantidad}
                onChange={e => updateLinea(l._id, 'cantidad', e.target.value)}
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <input
                className="input text-right"
                type="number" min="0" step="0.01"
                placeholder="0.00"
                value={l.precio_unitario}
                onChange={e => updateLinea(l._id, 'precio_unitario', e.target.value)}
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <select className="input text-right" value={l.iva_tasa}
                onChange={e => updateLinea(l._id, 'iva_tasa', e.target.value)}>
                <option value="0">0%</option>
                <option value="4">4%</option>
                <option value="10">10%</option>
                <option value="21">21%</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <input
                className="input text-right"
                type="number" min="0" max="100" step="1"
                placeholder="0"
                value={l.descuento}
                onChange={e => updateLinea(l._id, 'descuento', e.target.value)}
              />
            </div>
            <div className="col-span-4 md:col-span-1 flex items-center justify-end">
              <span className="text-sm font-semibold text-white">{formatEuro(calcLinea(l))}</span>
            </div>
            <div className="col-span-2 md:col-span-1 flex items-center justify-center">
              <button type="button" onClick={() => removeLinea(l._id)}
                className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                disabled={lineas.length === 1}
              >×</button>
            </div>
          </div>
        ))}

        <button type="button" onClick={addLinea}
          className="text-sm text-brand-500 hover:text-brand-600 transition-colors flex items-center gap-1 mt-2">
          + Añadir concepto
        </button>
      </div>

      {/* Totales + Notas */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="label">Notas / Condiciones de pago</label>
          <textarea
            className="input h-24 resize-none"
            placeholder="Ej: Pago a 30 días · Transferencia bancaria · IBAN ES..."
            value={form.notas}
            onChange={e => setForm({...form, notas: e.target.value})}
          />
        </div>
        <div className="card bg-gray-800/40 space-y-2">
          <Row label="Subtotal" value={formatEuro(subtotal)} />
          <Row label={`IVA`} value={formatEuro(ivaTotal)} />
          <div className="border-t border-gray-700 pt-2 flex justify-between items-center">
            <span className="font-bold text-white text-base">TOTAL</span>
            <span className="font-bold text-brand-500 text-xl">{formatEuro(total)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm p-3 rounded-lg">
          ⚠️ {error}
        </div>
      )}

      {/* Bottom buttons */}
      <div className="flex justify-end gap-3 pb-8">
        <button type="button" onClick={() => navigate('/facturas')} className="btn-secondary">Cancelar</button>
        <button type="submit" className="btn-primary px-6" disabled={saving}>
          {saving ? 'Guardando...' : '💾 Guardar factura'}
        </button>
      </div>
    </form>
  )
}

const Row = ({ label, value }) => (
  <div className="flex justify-between text-sm">
    <span className="text-gray-400">{label}</span>
    <span className="text-gray-200">{value}</span>
  </div>
)

const Skeleton = () => (
  <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-40" />
    <div className="h-48 bg-gray-800 rounded-xl" />
    <div className="h-32 bg-gray-800 rounded-xl" />
  </div>
)
