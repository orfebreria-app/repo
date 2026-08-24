import { useEffect, useState } from 'react'
import {
  getEmpresa, getProveedores, getProductos, upsertProducto,
  getAlbaranesProveedor, createAlbaranProveedor, updateAlbaranProveedor, deleteAlbaranProveedor,
  formatEuro, formatFecha,
} from '../lib/supabase'
import { tasaRE } from '../lib/calculos'
import { format } from 'date-fns'

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  _id_original: null,
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
  id: null,
  proveedor_id: '',
  numero: '',
  fecha_albaran: format(new Date(), 'yyyy-MM-dd'),
  notas: '',
  lineas: [lineaVacia()],
})

export default function AlbaranesProveedor({ session }) {
  const [empresa, setEmpresa]         = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [productos, setProductos]     = useState([])
  const [albaranes, setAlbaranes]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(false)
  const [editandoId, setEditandoId]   = useState(null)
  const [lineasOriginales, setLineasOriginales] = useState([])
  const [form, setForm]               = useState(emptyForm())
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [filtroEstado, setFiltroEstado] = useState('pendiente')

  const cargar = async (emp) => {
    const [{ data: albs }, { data: provs }, { data: prods }] = await Promise.all([
      getAlbaranesProveedor(emp.id),
      getProveedores(emp.id),
      getProductos(emp.id),
    ])
    setAlbaranes(albs)
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

  const openNew = () => { setForm(emptyForm()); setEditandoId(null); setLineasOriginales([]); setError(''); setModal(true) }

  const openEdit = (albaran) => {
    const lineasOrig = albaran.lineas_albaran_proveedor || []
    setLineasOriginales(lineasOrig)
    setForm({
      id: albaran.id,
      proveedor_id: albaran.proveedor_id,
      numero: albaran.numero || '',
      fecha_albaran: albaran.fecha_albaran,
      notas: albaran.notas || '',
      lineas: lineasOrig.length
        ? lineasOrig.map(l => ({
            _id: Math.random().toString(36).slice(2),
            _id_original: l.id,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario,
            iva_tasa: l.iva_tasa,
            recargo_tasa: l.recargo_tasa || '',
            producto_id: l.producto_id,
            referencia: l.referencia || '',
          }))
        : [lineaVacia()],
    })
    setEditandoId(albaran.id)
    setError('')
    setModal(true)
  }

  const closeModal = () => setModal(false)

  const setLinea = (id, campo, valor) => {
    setForm(f => ({ ...f, lineas: f.lineas.map(l => l._id === id ? { ...l, [campo]: valor } : l) }))
  }
  const addLinea = () => setForm(f => ({ ...f, lineas: [...f.lineas, lineaVacia()] }))
  const removeLinea = (id) => setForm(f => ({ ...f, lineas: f.lineas.filter(l => l._id !== id) }))

  const recargoLinea = (l) => {
    const tasa = l.recargo_tasa === '' ? tasaRE(l.iva_tasa) : Number(l.recargo_tasa)
    return +(calcBase(l) * tasa / 100).toFixed(2)
  }

  const subtotal     = form.lineas.reduce((s, l) => s + calcBase(l), 0)
  const ivaTotal      = form.lineas.reduce((s, l) => s + +(calcBase(l) * (Number(l.iva_tasa || 0) / 100)).toFixed(2), 0)
  const recargoTotal  = proveedorConRE ? form.lineas.reduce((s, l) => s + recargoLinea(l), 0) : 0
  const total         = subtotal + ivaTotal + recargoTotal

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.proveedor_id) return setError('Elige un proveedor')
    const lineasValidas = form.lineas.filter(l => l.descripcion.trim())
    if (!lineasValidas.length) return setError('Añade al menos una línea con descripción')

    setSaving(true)

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
          if (errProd) { setError('Error al crear el producto "' + ref + '": ' + errProd.message); setSaving(false); return }
          productoId = nuevoProd.id
        }
      }
      lineasConProducto.push({ ...l, producto_id: productoId })
    }

    const cabecera = {
      proveedor_id: form.proveedor_id,
      numero: form.numero || null,
      fecha_albaran: form.fecha_albaran,
      notas: form.notas || null,
      subtotal: +subtotal.toFixed(2),
      iva_total: +ivaTotal.toFixed(2),
      recargo_total: +recargoTotal.toFixed(2),
      total: +total.toFixed(2),
    }
    const lineas = lineasConProducto.map(l => ({
      _id_original: l._id_original || null,
      descripcion: l.descripcion,
      referencia: l.referencia || null,
      cantidad: Number(l.cantidad) || 0,
      precio_unitario: Number(l.precio_unitario) || 0,
      iva_tasa: Number(l.iva_tasa) || 0,
      recargo_tasa: proveedorConRE ? (l.recargo_tasa === '' ? tasaRE(l.iva_tasa) : Number(l.recargo_tasa)) : 0,
      recargo_importe: proveedorConRE ? recargoLinea(l) : 0,
      subtotal: calcBase(l),
      producto_id: l.producto_id || null,
    }))

    if (editandoId) {
      const { error: err } = await updateAlbaranProveedor(editandoId, { empresa_id: empresa.id, ...cabecera }, lineas, lineasOriginales)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const albaran = { empresa_id: empresa.id, ...cabecera }
      const { error: err } = await createAlbaranProveedor(albaran, lineas)
      if (err) { setError(err.message); setSaving(false); return }
    }

    await cargar(empresa)
    setSaving(false)
    closeModal()
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este albarán? Esto no revierte el stock que sumó al recibirlo.')) return
    await deleteAlbaranProveedor(id)
    await cargar(empresa)
  }

  const filtrados = filtroEstado ? albaranes.filter(a => a.estado === filtroEstado) : albaranes

  if (loading) return <Skeleton />

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Albaranes de proveedor</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2" disabled={!proveedores.length}>
          <span>+</span> Nuevo albarán
        </button>
      </div>

      {!proveedores.length && (
        <div className="card text-sm text-gray-400">
          Aún no tienes proveedores dados de alta. <a href="/proveedores" className="text-brand-500 hover:underline">Añade uno primero</a>.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <FiltroBtn label="Todos" activo={!filtroEstado} onClick={() => setFiltroEstado('')} />
        <FiltroBtn label="Pendientes" activo={filtroEstado === 'pendiente'} onClick={() => setFiltroEstado('pendiente')} />
        <FiltroBtn label="Facturados" activo={filtroEstado === 'facturado'} onClick={() => setFiltroEstado('facturado')} />
      </div>

      <div className="card p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm">Sin albaranes {filtroEstado === 'pendiente' ? 'pendientes' : ''} todavía.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <Th>Proveedor</Th><Th>Nº</Th><Th>Fecha</Th><Th>Estado</Th><Th className="text-right">Total</Th><Th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(a => (
                <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={() => openEdit(a)}>
                  <td className="py-3 px-4 font-medium text-white">{a.proveedores?.nombre || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 font-mono text-xs">{a.numero || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{formatFecha(a.fecha_albaran)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${a.estado === 'facturado' ? 'badge-pagada' : 'badge-borrador'}`}>
                      {a.estado}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm font-bold text-white">{a.total ? formatEuro(a.total) : '—'}</td>
                  <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(a)} className="text-xs text-brand-500 hover:underline px-2 py-1 mr-1">Editar</button>
                    {a.estado === 'pendiente' && (
                      <button onClick={() => handleDelete(a.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800">Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title={editandoId ? 'Editar albarán de proveedor' : 'Nuevo albarán de proveedor'} onClose={closeModal}>
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
                <label className="label">Nº de albarán</label>
                <input className="input" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} />
              </div>
              <div>
                <label className="label">Fecha</label>
                <input className="input" type="date" value={form.fecha_albaran} onChange={e => setForm({...form, fecha_albaran: e.target.value})} />
              </div>
            </div>

            {proveedorConRE && (
              <p className="text-xs text-brand-500 bg-brand-500/10 border border-brand-500/30 rounded-lg px-3 py-2">
                Este proveedor aplica recargo de equivalencia — indica el que te pongan en cada línea (o deja el valor por defecto).
              </p>
            )}

            {editandoId && (
              <p className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-3 py-2">
                Si cambias las cantidades, el stock de los artículos se ajustará automáticamente por la diferencia al guardar.
              </p>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Líneas</label>
                <button type="button" onClick={addLinea} className="text-xs text-brand-500 hover:underline">+ Añadir línea</button>
              </div>
              <div className="space-y-2">
                {form.lineas.map(l => (
                  <div key={l._id} className="grid grid-cols-12 gap-2 items-start">
                    <input
                      className="input col-span-2 text-xs font-mono"
                      list="lista-referencias-albaran"
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
                    <input className="input col-span-3 text-xs" placeholder="Descripción *" value={l.descripcion} onChange={e => setLinea(l._id, 'descripcion', e.target.value)} />
                    <input className="input col-span-1 text-xs" type="number" step="0.001" min="0" placeholder="Cant." value={l.cantidad} onChange={e => setLinea(l._id, 'cantidad', e.target.value)} />
                    <input className="input col-span-2 text-xs" type="number" step="0.01" min="0" placeholder="Precio (opc.)" value={l.precio_unitario} onChange={e => setLinea(l._id, 'precio_unitario', e.target.value)} />
                    <select className="input col-span-1 text-xs" value={l.iva_tasa} onChange={e => setLinea(l._id, 'iva_tasa', e.target.value)}>
                      <option value="">IVA</option>
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
              <datalist id="lista-referencias-albaran">
                {productos.filter(p => p.referencia).map(p => <option key={p.id} value={p.referencia} />)}
              </datalist>
              <p className="text-xs text-gray-600 mt-2">
                Solo la descripción es obligatoria — puedes dejar precio e IVA en blanco si el albarán no los trae, y rellenarlos luego al facturar.
                El stock se ajusta automáticamente al guardar (entrada al crear, diferencia al editar).
              </p>
            </div>

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
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar'}</button>
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
  <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${activo ? 'bg-brand-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
    {label}
  </button>
)

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full shadow-2xl overflow-y-auto max-h-[90vh] max-w-4xl">
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
