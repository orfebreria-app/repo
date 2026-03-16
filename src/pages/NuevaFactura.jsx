import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmpresa, getClientes, getProductos, getFacturas, createFactura, descontarStockVenta, tasaRE, formatEuro } from '../lib/supabase'
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
  const [clienteRE, setClienteRE] = useState(false)
  const [folioEditado, setFolioEditado] = useState('')
  const [siguienteFolio, setSiguienteFolio] = useState(null) // null = cargando

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
        const [{ data: cls }, { data: prods }, { data: facts }] = await Promise.all([
          getClientes(emp.id),
          getProductos(emp.id),
          getFacturas(emp.id),
        ])
        setClientes(cls)
        setProductos(prods || [])
        // Calcular el siguiente folio real mirando las facturas existentes
        const maxNum = (facts || []).reduce((max, f) => {
          const n = parseInt((f.folio || '').replace(/\D/g, '')) || 0
          return n > max ? n : max
        }, 0)
        setSiguienteFolio(maxNum + 1)
      }
      setLoading(false)
    }
    init()
  }, [session])

  const subtotal   = lineas.reduce((s, l) => s + calcLinea(l), 0)
  const ivaTotal   = lineas.reduce((s, l) => {
    const base = calcLinea(l)
    return s + +(base * (Number(l.iva_tasa) / 100)).toFixed(2)
  }, 0)
  const reTotal = clienteRE
    ? lineas.reduce((s, l) => {
        const base = calcLinea(l)
        return s + +(base * tasaRE(l.iva_tasa) / 100).toFixed(2)
      }, 0)
    : 0
  const total = +(subtotal + ivaTotal + reTotal).toFixed(2)

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
    const folioAuto = `${empresa.serie}-${String(siguienteFolio || 1).padStart(4, '0')}`
    const folio = folioEditado.trim() || folioAuto
    const facturaData = {
      empresa_id: empresa.id, cliente_id: form.cliente_id,
      folio, fecha_emision: form.fecha_emision,
      fecha_vencimiento: form.fecha_vencimiento || null,
      estado: form.estado, subtotal, iva_total: ivaTotal,
      recargo_total: reTotal,
      total, notas: form.notas,
    }
    const conceptos = lineas.map(l => {
      const base = calcLinea(l)
      const reImporte = clienteRE ? +(base * tasaRE(l.iva_tasa) / 100).toFixed(2) : 0
      return {
        descripcion: l.descripcion, cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario), iva_tasa: Number(l.iva_tasa),
        descuento: Number(l.descuento), subtotal: base,
        recargo_tasa: clienteRE ? tasaRE(l.iva_tasa) : 0,
        recargo_importe: reImporte,
        producto_id: l.producto_id || null,
      }
    })

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
          <BuscadorCliente
            clientes={clientes}
            clienteId={form.cliente_id}
            onChange={(cli) => {
              setClienteRE(!!cli?.recargo_equivalencia)
              setForm({...form, cliente_id: cli?.id || ''})
            }}
          />
          {clientes.length === 0 && (
            <p className="text-xs text-yellow-500 mt-1">
              No tienes clientes. <button type="button" onClick={() => navigate('/clientes')} className="underline">Añade uno primero →</button>
            </p>
          )}
          <label className="mt-2 flex items-center gap-3 cursor-pointer px-3 py-2 rounded-lg border transition-all"
            style={{ borderColor: clienteRE ? 'rgba(201,168,76,0.4)' : '#374151', background: clienteRE ? 'rgba(201,168,76,0.08)' : 'transparent' }}>
            <input type="checkbox" className="w-4 h-4 accent-yellow-500"
              checked={clienteRE}
              onChange={e => setClienteRE(e.target.checked)} />
            <span className="text-xs" style={{ color: clienteRE ? '#C9A84C' : '#9ca3af' }}>
              <strong>Recargo de Equivalencia</strong> — se añadirá en todos los conceptos (21%→+5,2% · 10%→+1,4% · 4%→+0,5%)
            </span>
          </label>
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
          <label className="label">
            Nº Factura
            <span className="text-gray-600 font-normal ml-1 text-xs">(editable)</span>
          </label>
          <input
            className="input font-mono"
            value={folioEditado || (siguienteFolio ? `${empresa.serie}-${String(siguienteFolio).padStart(4,'0')}` : '...')}
            onChange={e => setFolioEditado(e.target.value)}
            placeholder={siguienteFolio ? `${empresa.serie}-${String(siguienteFolio).padStart(4,'0')}` : 'Cargando...'}
          />
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
          {clienteRE && reTotal > 0 && (
            <Row label="Recargo Equivalencia" value={formatEuro(reTotal)} highlight />
          )}
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

const Row = ({ label, value, highlight }) => (
  <div className="flex justify-between text-sm">
    <span className={highlight ? 'font-medium' : 'text-gray-400'} style={highlight ? { color: '#C9A84C' } : {}}>{label}</span>
    <span className={highlight ? 'font-bold' : 'text-gray-200'} style={highlight ? { color: '#C9A84C' } : {}}>{value}</span>
  </div>
)

const Skeleton = () => (
  <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-40" />
    <div className="h-48 bg-gray-800 rounded-xl" />
    <div className="h-32 bg-gray-800 rounded-xl" />
  </div>
)

function BuscadorCliente({ clientes, clienteId, onChange }) {
  const [busq, setBusq] = useState('')
  const [abierto, setAbierto] = useState(false)
  const clienteActual = clientes.find(c => c.id === clienteId)

  const filtrados = busq.length > 0
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(busq.toLowerCase()) ||
        (c.nif_cif||'').toLowerCase().includes(busq.toLowerCase()) ||
        (c.email||'').toLowerCase().includes(busq.toLowerCase())
      ).slice(0, 8)
    : clientes.slice(0, 8)

  return (
    <div className="relative">
      <div className="relative">
        <input
          className="input pr-8"
          placeholder="🔍 Buscar cliente por nombre, NIF o email..."
          value={abierto ? busq : (clienteActual?.nombre || '')}
          onChange={e => { setBusq(e.target.value); setAbierto(true) }}
          onFocus={() => { setBusq(''); setAbierto(true) }}
          onBlur={() => setTimeout(() => setAbierto(false), 200)}
        />
        {clienteActual && !abierto && (
          <button type="button" onClick={() => { onChange(null); setBusq('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 text-lg">×</button>
        )}
      </div>
      {abierto && (
        <div className="absolute top-full left-0 right-0 z-50 rounded-lg shadow-xl mt-1 overflow-hidden max-h-64 overflow-y-auto"
          style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
          {filtrados.length === 0
            ? <div className="px-4 py-3 text-sm text-gray-500">Sin resultados</div>
            : filtrados.map(c => (
              <button key={c.id} type="button"
                onMouseDown={() => { onChange(c); setBusq(''); setAbierto(false) }}
                className="w-full text-left px-4 py-2.5 hover:bg-white/5 flex items-center justify-between gap-3 border-b"
                style={{ borderColor: '#2a2418' }}>
                <div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    {c.nombre}
                    {c.recargo_equivalencia && <span className="text-xs px-1 rounded font-bold" style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}>RE</span>}
                  </div>
                  <div className="text-xs text-gray-500">{c.nif_cif || ''} {c.email ? `· ${c.email}` : ''}</div>
                </div>
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}
