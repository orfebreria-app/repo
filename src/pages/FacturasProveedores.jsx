import { useEffect, useState } from 'react'
import {
  getEmpresa, getProveedores, getProductos,
  getFacturasProveedor, createFacturaProveedor,
  updateEstadoFacturaProveedor, deleteFacturaProveedor,
  formatEuro, formatFecha,
} from '../lib/supabase'
import { format } from 'date-fns'

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  cantidad: 1,
  precio_unitario: '',
  iva_tasa: 21,
  producto_id: null,
})

const calcLinea = (l) => +(Number(l.cantidad) * Number(l.precio_unitario || 0)).toFixed(2)

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
  const [form, setForm]               = useState(emptyForm())
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

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

  const openNew = () => { setForm(emptyForm()); setError(''); setModal(true) }
  const closeModal = () => setModal(false)

  const setLinea = (id, campo, valor) => {
    setForm(f => ({ ...f, lineas: f.lineas.map(l => l._id === id ? { ...l, [campo]: valor } : l) }))
  }
  const addLinea = () => setForm(f => ({ ...f, lineas: [...f.lineas, lineaVacia()] }))
  const removeLinea = (id) => setForm(f => ({ ...f, lineas: f.lineas.filter(l => l._id !== id) }))

  const subtotal = form.lineas.reduce((s, l) => s + calcLinea(l), 0)
  const ivaTotal  = form.lineas.reduce((s, l) => s + calcLinea(l) * (Number(l.iva_tasa) / 100), 0)
  const total     = subtotal + ivaTotal

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.proveedor_id) return setError('Elige un proveedor')
    const lineasValidas = form.lineas.filter(l => l.descripcion.trim() && Number(l.precio_unitario) > 0)
    if (!lineasValidas.length) return setError('Añade al menos una línea con descripción y precio')

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
      total: +total.toFixed(2),
    }
    const lineas = lineasValidas.map(l => ({
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad),
      precio_unitario: Number(l.precio_unitario),
      iva_tasa: Number(l.iva_tasa),
      subtotal: calcLinea(l),
      producto_id: l.producto_id || null,
    }))

    const { error: err } = await createFacturaProveedor(factura, lineas)
    if (err) { setError(err.message); setSaving(false); return }
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Proveedor *</label>
                <select className="input" value={form.proveedor_id} onChange={e => setForm({...form, proveedor_id: e.target.value})} required>
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Líneas</label>
                <button type="button" onClick={addLinea} className="text-xs text-brand-500 hover:underline">+ Añadir línea</button>
              </div>
              <div className="space-y-2">
                {form.lineas.map(l => (
                  <div key={l._id} className="grid grid-cols-12 gap-2 items-start">
                    <select
                      className="input col-span-3 text-xs"
                      value={l.producto_id || ''}
                      onChange={e => {
                        const prod = productos.find(p => p.id === e.target.value)
                        setLinea(l._id, 'producto_id', e.target.value || null)
                        if (prod) {
                          setLinea(l._id, 'descripcion', prod.nombre)
                          setLinea(l._id, 'precio_unitario', prod.precio_compra || '')
                          setLinea(l._id, 'iva_tasa', prod.iva_tasa ?? 21)
                        }
                      }}
                    >
                      <option value="">(sin vincular)</option>
                      {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                    <input className="input col-span-4 text-xs" placeholder="Descripción" value={l.descripcion} onChange={e => setLinea(l._id, 'descripcion', e.target.value)} />
                    <input className="input col-span-1 text-xs" type="number" step="0.001" min="0" value={l.cantidad} onChange={e => setLinea(l._id, 'cantidad', e.target.value)} />
                    <input className="input col-span-2 text-xs" type="number" step="0.01" min="0" placeholder="Precio" value={l.precio_unitario} onChange={e => setLinea(l._id, 'precio_unitario', e.target.value)} />
                    <select className="input col-span-1 text-xs" value={l.iva_tasa} onChange={e => setLinea(l._id, 'iva_tasa', e.target.value)}>
                      <option value={0}>0%</option><option value={4}>4%</option><option value={10}>10%</option><option value={21}>21%</option>
                    </select>
                    <button type="button" onClick={() => removeLinea(l._id)} className="col-span-1 text-gray-600 hover:text-red-400 text-xs">✕</button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">Vincular una línea a un producto suma su cantidad al stock automáticamente al guardar.</p>
            </div>

            <div>
              <label className="label">Notas</label>
              <textarea className="input h-16 resize-none text-sm" value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} />
            </div>

            <div className="flex justify-end gap-6 text-sm border-t border-gray-800 pt-3">
              <div>Subtotal <span className="font-mono text-gray-300 ml-2">{formatEuro(subtotal)}</span></div>
              <div>IVA <span className="font-mono text-gray-300 ml-2">{formatEuro(ivaTotal)}</span></div>
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
