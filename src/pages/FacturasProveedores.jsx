import { useEffect, useState } from 'react'
import {
  getEmpresa, getProveedores, getProductos, upsertProducto,
  getFacturasProveedor, createFacturaProveedor,
  getAlbaranesPendientes, crearFacturaDesdeAlbaranes,
  updateEstadoFacturaProveedor, deleteFacturaProveedor,
  formatEuro, formatFecha,
} from '../lib/supabase'
import { tasaRE } from '../lib/calculos'
import { format } from 'date-fns'

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  cantidad: 1,
  precio_unitario: '',
  iva_tasa: 21,
  recargo_tasa: '',
  producto_id: null,
  referencia: '',
})

const calcBase = (l) => +(Number(l.cantidad || 0) * Number(l.precio_unitario || 0)).toFixed(2)

const emptyForm = () => ({
  proveedor_id: '',
  numero: '',
  fecha_factura: format(new Date(), 'yyyy-MM-dd'),
  fecha_vencimiento: '',
  notas: '',
  lineas: [lineaVacia()],
})

const ESTADOS = ['pendiente', 'pagada', 'vencida', 'cancelada']

export default function FacturasProveedores({ session }) {
  const [empresa, setEmpresa]         = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [productos, setProductos]     = useState([])
  const [facturas, setFacturas]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(false)
  const [modo, setModo]               = useState('albaranes') // 'albaranes' | 'manual'
  const [form, setForm]               = useState(emptyForm())
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  const [albaranesPendientes, setAlbaranesPendientes] = useState([])
  const [seleccionados, setSeleccionados]             = useState([])
  const [cargandoAlbaranes, setCargandoAlbaranes]     = useState(false)

  const cargar = async (emp) => {
    const [{ data: facts }, { data: provs }, { data: prods }] = await Promise.all([
      getFacturasProveedor(emp.id),
      getProveedores(emp.id),
      getProductos(emp.id),
    ])
    setFacturas(facts)
    setProveedores(provs)
    setProductos(prods)
  }

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) await cargar(emp)
      setLoading(false)
    }
    init()
  }, [session])

  const proveedorSeleccionado = proveedores.find(p => p.id === form.proveedor_id)
  const proveedorConRE = !!proveedorSeleccionado?.recargo_equivalencia

  const openNew = () => { setForm(emptyForm()); setError(''); setModo('albaranes'); setSeleccionados([]); setAlbaranesPendientes([]); setModal(true) }
  const closeModal = () => setModal(false)

  const cambiarProveedor = async (proveedorId) => {
    setForm(f => ({ ...f, proveedor_id: proveedorId }))
    setSeleccionados([])
    if (proveedorId && modo === 'albaranes') {
      setCargandoAlbaranes(true)
      const { data } = await getAlbaranesPendientes(empresa.id, proveedorId)
      setAlbaranesPendientes(data)
      setCargandoAlbaranes(false)
    } else {
      setAlbaranesPendientes([])
    }
  }

  const cambiarModo = async (nuevoModo) => {
    setModo(nuevoModo)
    setSeleccionados([])
    if (nuevoModo === 'albaranes' && form.proveedor_id) {
      setCargandoAlbaranes(true)
      const { data } = await getAlbaranesPendientes(empresa.id, form.proveedor_id)
      setAlbaranesPendientes(data)
      setCargandoAlbaranes(false)
    } else {
      setForm(f => ({ ...f, lineas: [lineaVacia()] }))
    }
  }

  const toggleAlbaran = (id) => {
    setSeleccionados(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  // Cada vez que cambia la selección de albaranes, se regeneran las
  // líneas editables de la factura a partir de sus líneas — el
  // usuario puede tocar precio, IVA o recargo, añadir líneas nuevas
  // o quitar alguna, igual que en el modo manual.
  useEffect(() => {
    if (modo !== 'albaranes') return
    const lineasDeAlbaranes = albaranesPendientes
      .filter(a => seleccionados.includes(a.id))
      .flatMap(a => (a.lineas_albaran_proveedor || []).map(l => ({
        _id: l.id,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        iva_tasa: l.iva_tasa,
        recargo_tasa: l.recargo_tasa || '',
        producto_id: l.producto_id,
        referencia: l.referencia || '',
      })))
    setForm(f => ({ ...f, lineas: lineasDeAlbaranes }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionados, modo])

  const setLinea = (id, campo, valor) => {
    setForm(f => ({ ...f, lineas: f.lineas.map(l => l._id === id ? { ...l, [campo]: valor } : l) }))
  }
  const addLinea = () => setForm(f => ({ ...f, lineas: [...f.lineas, lineaVacia()] }))
  const removeLinea = (id) => setForm(f => ({ ...f, lineas: f.lineas.filter(l => l._id !== id) }))

  const recargoLinea = (l) => {
    const tasa = l.recargo_tasa === '' || l.recargo_tasa === undefined ? tasaRE(l.iva_tasa) : Number(l.recargo_tasa)
    return +(calcBase(l) * tasa / 100).toFixed(2)
  }

  const subtotal    = form.lineas.reduce((s, l) => s + calcBase(l), 0)
  const ivaTotal     = form.lineas.reduce((s, l) => s + +(calcBase(l) * (Number(l.iva_tasa || 0) / 100)).toFixed(2), 0)
  const recargoTotal = proveedorConRE ? form.lineas.reduce((s, l) => s + recargoLinea(l), 0) : 0
  const total        = subtotal + ivaTotal + recargoTotal

  const resolverLineasConProducto = async (lineasValidas) => {
    const lineasConProducto = []
    for (const l of lineasValidas) {
      let productoId = l.producto_id
      const ref = (l.referencia || '').trim()
      if (!productoId && ref) {
        const existente = productos.find(p => (p.referencia || '').toLowerCase() === ref.toLowerCase())
        if (existente) {
          productoId = existente.id
        } else {
          const { data: nuevoProd, error: errProd } = await upsertProducto({
            empresa_id: empresa.id,
            proveedor_id: form.proveedor_id,
            nombre: l.descripcion || ref,
            referencia: ref,
            precio_compra: Number(l.precio_unitario) || 0,
            iva_tasa: Number(l.iva_tasa) || 21,
            stock_actual: 0,
          })
          if (errProd) throw new Error('Error al crear el producto "' + ref + '": ' + errProd.message)
          productoId = nuevoProd.id
        }
      }
      lineasConProducto.push({ ...l, producto_id: productoId })
    }
    return lineasConProducto
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.proveedor_id) return setError('Elige un proveedor')

    const lineasValidas = form.lineas.filter(l => l.descripcion.trim())
    if (!lineasValidas.length) return setError('Añade al menos una línea con descripción')
    if (modo === 'albaranes' && !seleccionados.length) return setError('Selecciona al menos un albarán')

    setSaving(true)

    const factura = {
      empresa_id: empresa.id,
      proveedor_id: form.proveedor_id,
      numero: form.numero || null,
      fecha_factura: form.fecha_factura,
      fecha_vencimiento: form.fecha_vencimiento || null,
      notas: form.notas || null,
      subtotal: +subtotal.toFixed(2),
      iva_total: +ivaTotal.toFixed(2),
      recargo_total: +recargoTotal.toFixed(2),
      total: +total.toFixed(2),
    }

    try {
      const lineasConProducto = await resolverLineasConProducto(lineasValidas)
      const lineas = lineasConProducto.map(l => ({
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad) || 0,
        precio_unitario: Number(l.precio_unitario) || 0,
        iva_tasa: Number(l.iva_tasa) || 0,
        recargo_tasa: proveedorConRE ? (l.recargo_tasa === '' ? tasaRE(l.iva_tasa) : Number(l.recargo_tasa)) : 0,
        recargo_importe: proveedorConRE ? recargoLinea(l) : 0,
        subtotal: calcBase(l),
        producto_id: l.producto_id || null,
      }))

      if (modo === 'albaranes') {
        const { error: err } = await crearFacturaDesdeAlbaranes(factura, lineas, seleccionados)
        if (err) throw new Error(err.message)
      } else {
        const { error: err } = await createFacturaProveedor(factura, lineas)
        if (err) throw new Error(err.message)
      }
    } catch (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    await cargar(empresa)
    setSaving(false)
    closeModal()
  }

  const cambiarEstado = async (id, estado) => {
    await updateEstadoFacturaProveedor(id, estado)
    await cargar(empresa)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta factura de proveedor? Esto no revierte el stock que sumó al crearla.')) return
    await deleteFacturaProveedor(id)
    await cargar(empresa)
  }

  const filtradas = filtroEstado ? facturas.filter(f => f.estado === filtroEstado) : facturas

  if (loading) return <Skeleton />

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Facturas de proveedor</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2" disabled={!proveedores.length}>
          <span>+</span> Nueva factura de compra
        </button>
      </div>

      {!proveedores.length && (
        <div className="card text-sm text-gray-400">
          Aún no tienes proveedores dados de alta. <a href="/proveedores" className="text-brand-500 hover:underline">Añade uno primero</a>.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <FiltroBtn label="Todas" activo={!filtroEstado} onClick={() => setFiltroEstado('')} />
        {ESTADOS.map(e => (
          <FiltroBtn key={e} label={e} activo={filtroEstado === e} onClick={() => setFiltroEstado(e)} />
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">📥</div>
            <p className="text-sm">Sin facturas de proveedor todavía.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <Th>Proveedor</Th><Th>Nº</Th><Th>Fecha</Th><Th>Vencimiento</Th><Th>Estado</Th><Th className="text-right">Total</Th><Th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map(f => (
                <tr key={f.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-white">{f.proveedores?.nombre || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 font-mono text-xs">{f.numero || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{formatFecha(f.fecha_factura)}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{f.fecha_vencimiento ? formatFecha(f.fecha_vencimiento) : '—'}</td>
                  <td className="py-3 px-4">
                    <select
                      value={f.estado}
                      onChange={e => cambiarEstado(f.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer badge-${f.estado === 'pagada' ? 'pagada' : f.estado === 'vencida' ? 'vencida' : f.estado === 'cancelada' ? 'cancelada' : 'borrador'}`}
                    >
                      {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm font-bold text-white">{formatEuro(f.total)}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => handleDelete(f.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title="Nueva factura de proveedor" onClose={closeModal}>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex gap-2">
              <ModoBtn label="Desde albaranes recibidos" activo={modo === 'albaranes'} onClick={() => cambiarModo('albaranes')} />
              <ModoBtn label="Manual (sin albarán)" activo={modo === 'manual'} onClick={() => cambiarModo('manual')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Proveedor *</label>
                <select className="input" value={form.proveedor_id} onChange={e => cambiarProveedor(e.target.value)} required>
                  <option value="">Selecciona...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Nº de factura del proveedor</label>
                <input className="input" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} />
              </div>
              <div>
                <label className="label">Fecha factura</label>
                <input className="input" type="date" value={form.fecha_factura} onChange={e => setForm({...form, fecha_factura: e.target.value})} />
              </div>
              <div>
                <label className="label">Fecha de vencimiento</label>
                <input className="input" type="date" value={form.fecha_vencimiento} onChange={e => setForm({...form, fecha_vencimiento: e.target.value})} />
              </div>
            </div>

            {proveedorConRE && (
              <p className="text-xs text-brand-500 bg-brand-500/10 border border-brand-500/30 rounded-lg px-3 py-2">
                Este proveedor aplica recargo de equivalencia — indica el que te pongan en cada línea (o deja el valor por defecto).
              </p>
            )}

            {modo === 'albaranes' && (
              <div>
                <label className="label mb-2">Albaranes pendientes de este proveedor</label>
                {!form.proveedor_id ? (
                  <p className="text-sm text-gray-600">Elige un proveedor para ver sus albaranes pendientes.</p>
                ) : cargandoAlbaranes ? (
                  <p className="text-sm text-gray-600">Cargando...</p>
                ) : !albaranesPendientes.length ? (
                  <p className="text-sm text-gray-600">Este proveedor no tiene albaranes pendientes de facturar.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {albaranesPendientes.map(a => (
                      <label key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 cursor-pointer hover:bg-gray-800">
                        <input type="checkbox" checked={seleccionados.includes(a.id)} onChange={() => toggleAlbaran(a.id)} />
                        <div className="flex-1 flex justify-between items-center text-sm">
                          <span className="text-gray-300">{a.numero || 'Sin número'} · {formatFecha(a.fecha_albaran)} · {(a.lineas_albaran_proveedor || []).length} línea(s)</span>
                          <span className="font-mono text-white">{a.total ? formatEuro(a.total) : 'sin precio'}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(modo === 'manual' || seleccionados.length > 0) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Líneas de la factura</label>
                  <button type="button" onClick={addLinea} className="text-xs text-brand-500 hover:underline">+ Añadir línea</button>
                </div>
                <div className="space-y-2">
                  {form.lineas.map(l => (
                    <div key={l._id} className="grid grid-cols-12 gap-2 items-start">
                      <input
                        className="input col-span-2 text-xs font-mono"
                        list="lista-referencias"
                        placeholder="Código"
                        value={l.referencia}
                        onChange={e => {
                          const ref = e.target.value
                          setLinea(l._id, 'referencia', ref)
                          const prod = productos.find(p => (p.referencia || '').toLowerCase() === ref.trim().toLowerCase())
                          if (prod) {
                            setLinea(l._id, 'producto_id', prod.id)
                            setLinea(l._id, 'descripcion', prod.nombre)
                            setLinea(l._id, 'precio_unitario', prod.precio_compra || '')
                            setLinea(l._id, 'iva_tasa', prod.iva_tasa ?? 21)
                          } else {
                            setLinea(l._id, 'producto_id', null)
                          }
                        }}
                      />
                      <input className="input col-span-3 text-xs" placeholder="Descripción" value={l.descripcion} onChange={e => setLinea(l._id, 'descripcion', e.target.value)} />
                      <input className="input col-span-1 text-xs" type="number" step="0.001" min="0" value={l.cantidad} onChange={e => setLinea(l._id, 'cantidad', e.target.value)} />
                      <input className="input col-span-2 text-xs" type="number" step="0.01" min="0" placeholder="Precio" value={l.precio_unitario} onChange={e => setLinea(l._id, 'precio_unitario', e.target.value)} />
                      <select className="input col-span-1 text-xs" value={l.iva_tasa} onChange={e => setLinea(l._id, 'iva_tasa', e.target.value)}>
                        <option value={0}>0%</option><option value={4}>4%</option><option value={10}>10%</option><option value={21}>21%</option>
                      </select>
                      {proveedorConRE && (
                        <input
                          className="input col-span-1 text-xs" type="number" step="0.01" min="0"
                          placeholder={`RE ${tasaRE(l.iva_tasa)}%`}
                          value={l.recargo_tasa}
                          onChange={e => setLinea(l._id, 'recargo_tasa', e.target.value)}
                        />
                      )}
                      <span className={`text-xs text-center pt-2 ${proveedorConRE ? 'col-span-1' : 'col-span-2'}`} title={l.referencia ? (l.producto_id ? 'Producto existente' : 'Se creará como producto nuevo') : 'Sin código: no afecta al stock'}>
                        {l.referencia ? (l.producto_id ? '✅' : '🆕') : '—'}
                      </span>
                      <button type="button" onClick={() => removeLinea(l._id)} className="col-span-1 text-gray-600 hover:text-red-400 text-xs">✕</button>
                    </div>
                  ))}
                </div>
                <datalist id="lista-referencias">
                  {productos.filter(p => p.referencia).map(p => <option key={p.id} value={p.referencia} />)}
                </datalist>
                <p className="text-xs text-gray-600 mt-2">
                  {modo === 'albaranes'
                    ? 'Puedes ajustar cualquier dato respecto al albarán (el proveedor a veces cobra distinto), añadir líneas nuevas o quitar alguna.'
                    : 'Usa este modo solo cuando no hay un albarán previo (por ejemplo, servicios). Aquí el stock se suma al guardar la factura.'}
                </p>
              </div>
            )}

            <div>
              <label className="label">Notas</label>
              <textarea className="input h-16 resize-none text-sm" value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} />
            </div>

            <div className="flex justify-end gap-6 text-sm border-t border-gray-800 pt-3">
              <div>Subtotal <span className="font-mono text-gray-300 ml-2">{formatEuro(subtotal)}</span></div>
              <div>IVA <span className="font-mono text-gray-300 ml-2">{formatEuro(ivaTotal)}</span></div>
              {proveedorConRE && <div>Recargo <span className="font-mono text-gray-300 ml-2">{formatEuro(recargoTotal)}</span></div>}
              <div className="font-bold">Total <span className="font-mono text-white ml-2">{formatEuro(total)}</span></div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

const Th = ({ children, className = '' }) => (
  <th className={`text-left py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide ${className}`}>{children}</th>
)

const FiltroBtn = ({ label, activo, onClick }) => (
  <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors ${activo ? 'bg-brand-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
    {label}
  </button>
)

const ModoBtn = ({ label, activo, onClick }) => (
  <button type="button" onClick={onClick} className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors flex-1 ${activo ? 'bg-brand-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
    {label}
  </button>
)

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full shadow-2xl overflow-y-auto max-h-[90vh] max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const Skeleton = () => (
  <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-56" />
    <div className="h-10 bg-gray-800 rounded w-64" />
    <div className="h-48 bg-gray-800 rounded-xl" />
  </div>
)
