import { useEffect, useState } from 'react'
import { getEmpresa, getProductos, upsertProducto, deleteProducto,
         getProveedores, upsertProveedor, deleteProveedor,
         getMovimientos, entradaStock, ajusteStock, formatEuro, formatFecha } from '../lib/supabase'

const TABS = ['📦 Productos', '🏭 Proveedores', '📋 Movimientos']

const CATEGORIAS = ['Trofeos', 'Medallas', 'Placas', 'Figuras', 'Copas', 'Peanas', 'Llaveros', 'Escudos', 'Material grabación', 'Otros']

export default function Stock({ session }) {
  const [tab, setTab]           = useState(0)
  const [empresa, setEmpresa]   = useState(null)
  const [productos, setProductos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading]   = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')

  // Modales
  const [modalProducto, setModalProducto] = useState(null) // null | {} | {id,...}
  const [modalProveedor, setModalProveedor] = useState(null)
  const [modalEntrada, setModalEntrada]   = useState(null) // producto
  const [modalAjuste, setModalAjuste]     = useState(null) // producto

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      if (!emp) return
      setEmpresa(emp)
      await cargar(emp.id)
    }
    init()
  }, [session])

  const cargar = async (eid) => {
    setLoading(true)
    const [r1, r2, r3] = await Promise.all([
      getProductos(eid),
      getProveedores(eid),
      getMovimientos(eid),
    ])
    setProductos(r1.data)
    setProveedores(r2.data)
    setMovimientos(r3.data)
    setLoading(false)
  }

  const productosFiltrados = productos.filter(p => {
    const b = busqueda.toLowerCase()
    const matchBusq = !b || p.nombre.toLowerCase().includes(b) || (p.referencia||'').toLowerCase().includes(b) || (p.categoria||'').toLowerCase().includes(b)
    const matchProv = !filtroProveedor || p.proveedor_id === filtroProveedor
    return matchBusq && matchProv
  })

  const stockBajo = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_minimo > 0)

  if (loading) return <div className="text-gray-500 p-8 text-center">Cargando stock...</div>

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📦 Stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">{productos.length} productos · {proveedores.length} proveedores</p>
        </div>
        <div className="flex gap-2">
          {tab === 0 && (
            <button onClick={() => setModalProducto({})} className="btn-primary flex items-center gap-2">
              + Nuevo producto
            </button>
          )}
          {tab === 1 && (
            <button onClick={() => setModalProveedor({})} className="btn-primary flex items-center gap-2">
              + Nuevo proveedor
            </button>
          )}
        </div>
      </div>

      {/* Alertas stock bajo */}
      {stockBajo.length > 0 && (
        <div className="rounded-xl border border-yellow-800 bg-yellow-900/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-400 font-bold text-sm">⚠️ Stock bajo en {stockBajo.length} producto{stockBajo.length > 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stockBajo.map(p => (
              <span key={p.id} className="text-xs bg-yellow-900/40 border border-yellow-800 text-yellow-300 px-2 py-1 rounded-lg">
                {p.nombre} — {p.stock_actual} {p.unidad} (mín. {p.stock_minimo})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all
              ${tab === i ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            style={tab === i ? { background: 'linear-gradient(135deg,#C9A84C,#a8882e)', color: '#1a1400' } : {}}>
            {t}
          </button>
        ))}
      </div>

      {/* ── TAB PRODUCTOS ─────────────────────────────── */}
      {tab === 0 && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <input className="input max-w-xs" placeholder="🔍 Buscar producto o referencia..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <select className="input max-w-xs" value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Productos', valor: productos.length, icon: '📦' },
              { label: 'Stock bajo', valor: stockBajo.length, icon: '⚠️', alert: stockBajo.length > 0 },
              { label: 'Sin stock', valor: productos.filter(p => p.stock_actual <= 0).length, icon: '❌' },
              { label: 'Valor total', valor: formatEuro(productos.reduce((s, p) => s + p.stock_actual * p.precio_compra, 0)), icon: '💰', small: true },
            ].map((k, i) => (
              <div key={i} className="card text-center py-3">
                <div className="text-2xl mb-1">{k.icon}</div>
                <div className={`text-xl font-bold ${k.alert ? 'text-yellow-400' : 'text-white'} ${k.small ? 'text-base' : ''}`}>{k.valor}</div>
                <div className="text-xs text-gray-500">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2418' }}>
                  {['Referencia', 'Producto', 'Categoría', 'Proveedor', 'Precio venta', 'Stock', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-600">No hay productos. Crea el primero →</td></tr>
                )}
                {productosFiltrados.map(p => {
                  const bajo = p.stock_actual <= p.stock_minimo && p.stock_minimo > 0
                  const sinStock = p.stock_actual <= 0
                  return (
                    <tr key={p.id} className="border-t transition-colors hover:bg-white/5" style={{ borderColor: '#1e1c18' }}>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.referencia || '—'}</td>
                      <td className="px-4 py-3 font-medium text-white">{p.nombre}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.categoria || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.proveedores?.nombre || '—'}</td>
                      <td className="px-4 py-3 text-white font-mono text-xs">{formatEuro(p.precio_venta)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                          sinStock ? 'bg-red-900/50 text-red-400 border border-red-800' :
                          bajo    ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800' :
                                    'bg-green-900/30 text-green-400 border border-green-900'
                        }`}>
                          {p.stock_actual} {p.unidad}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setModalEntrada(p)}
                            title="Entrada de stock"
                            className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/60 border border-green-900 transition-colors">
                            +
                          </button>
                          <button onClick={() => setModalAjuste(p)}
                            title="Ajustar stock"
                            className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700 transition-colors">
                            ✏️
                          </button>
                          <button onClick={() => setModalProducto(p)}
                            className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700 transition-colors">
                            ⚙️
                          </button>
                          <button onClick={async () => {
                            if (!confirm(`¿Eliminar "${p.nombre}"?`)) return
                            await deleteProducto(p.id)
                            await cargar(empresa.id)
                          }} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/60 border border-red-900 transition-colors">
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB PROVEEDORES ───────────────────────────── */}
      {tab === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {proveedores.length === 0 && (
              <div className="text-gray-600 text-sm col-span-3 text-center py-12">
                No hay proveedores. Crea el primero →
              </div>
            )}
            {proveedores.map(prov => (
              <div key={prov.id} className="card space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-white">{prov.nombre}</div>
                    {prov.nif_cif && <div className="text-xs text-gray-500 font-mono">{prov.nif_cif}</div>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setModalProveedor(prov)}
                      className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700">⚙️</button>
                    <button onClick={async () => {
                      if (!confirm(`¿Eliminar "${prov.nombre}"?`)) return
                      await deleteProveedor(prov.id)
                      await cargar(empresa.id)
                    }} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/60 border border-red-900">🗑</button>
                  </div>
                </div>
                {prov.email    && <div className="text-xs text-gray-400">✉️ {prov.email}</div>}
                {prov.telefono && <div className="text-xs text-gray-400">📞 {prov.telefono}</div>}
                {prov.ciudad   && <div className="text-xs text-gray-400">📍 {prov.ciudad}</div>}
                <div className="text-xs text-gray-600 border-t pt-2 mt-1" style={{ borderColor: '#2a2418' }}>
                  {productos.filter(p => p.proveedor_id === prov.id).length} productos asociados
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB MOVIMIENTOS ───────────────────────────── */}
      {tab === 2 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2418' }}>
                {['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Stock anterior', 'Stock posterior', 'Referencia'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientos.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-600">Sin movimientos aún</td></tr>
              )}
              {movimientos.map(m => {
                const esEntrada = m.cantidad > 0
                const tipoLabel = {
                  entrada: '📥 Entrada',
                  salida_factura: '🧾 Factura',
                  salida_ticket: '🏪 Ticket',
                  ajuste_positivo: '⬆️ Ajuste +',
                  ajuste_negativo: '⬇️ Ajuste -',
                }[m.tipo] || m.tipo
                return (
                  <tr key={m.id} className="border-t transition-colors hover:bg-white/5" style={{ borderColor: '#1e1c18' }}>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{formatFecha(m.creado_en)}</td>
                    <td className="px-4 py-2.5 text-white text-xs">{m.productos?.nombre || '—'}</td>
                    <td className="px-4 py-2.5 text-xs">{tipoLabel}</td>
                    <td className={`px-4 py-2.5 font-bold font-mono text-xs ${esEntrada ? 'text-green-400' : 'text-red-400'}`}>
                      {esEntrada ? '+' : ''}{m.cantidad}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{m.stock_anterior}</td>
                    <td className="px-4 py-2.5 text-gray-300 font-mono text-xs font-bold">{m.stock_posterior}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{m.notas || m.referencia_tipo || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL PRODUCTO ────────────────────────────── */}
      {modalProducto && (
        <ModalProducto
          producto={modalProducto}
          proveedores={proveedores}
          empresaId={empresa.id}
          onClose={() => setModalProducto(null)}
          onSaved={() => { setModalProducto(null); cargar(empresa.id) }}
        />
      )}

      {/* ── MODAL PROVEEDOR ───────────────────────────── */}
      {modalProveedor && (
        <ModalProveedor
          proveedor={modalProveedor}
          empresaId={empresa.id}
          onClose={() => setModalProveedor(null)}
          onSaved={() => { setModalProveedor(null); cargar(empresa.id) }}
        />
      )}

      {/* ── MODAL ENTRADA STOCK ───────────────────────── */}
      {modalEntrada && (
        <ModalEntrada
          producto={modalEntrada}
          empresaId={empresa.id}
          onClose={() => setModalEntrada(null)}
          onSaved={() => { setModalEntrada(null); cargar(empresa.id) }}
        />
      )}

      {/* ── MODAL AJUSTE STOCK ────────────────────────── */}
      {modalAjuste && (
        <ModalAjuste
          producto={modalAjuste}
          empresaId={empresa.id}
          onClose={() => setModalAjuste(null)}
          onSaved={() => { setModalAjuste(null); cargar(empresa.id) }}
        />
      )}
    </div>
  )
}

// ── Modal Producto ──────────────────────────────────────
function ModalProducto({ producto, proveedores, empresaId, onClose, onSaved }) {
  const esNuevo = !producto.id
  const [form, setForm] = useState({
    nombre: '', referencia: '', descripcion: '', categoria: '',
    precio_venta: '', precio_compra: '', iva_tasa: 21,
    stock_actual: 0, stock_minimo: 0, unidad: 'ud',
    proveedor_id: '', activo: true,
    ...producto,
    empresa_id: empresaId,
  })
  const [saving, setSaving] = useState(false)

  const f = (k) => ({ value: form[k] ?? '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) })

  const handleSave = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio')
    setSaving(true)
    const payload = {
      ...form,
      precio_venta:  Number(form.precio_venta)  || 0,
      precio_compra: Number(form.precio_compra) || 0,
      iva_tasa:      Number(form.iva_tasa)      || 21,
      stock_actual:  Number(form.stock_actual)  || 0,
      stock_minimo:  Number(form.stock_minimo)  || 0,
      proveedor_id:  form.proveedor_id || null,
    }
    await upsertProducto(payload)
    setSaving(false)
    onSaved()
  }

  return (
    <Modal title={esNuevo ? '+ Nuevo producto' : `✏️ ${producto.nombre}`} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="label">Nombre *</label>
          <input className="input" placeholder="Ej: Trofeo 35cm personalizable" {...f('nombre')} />
        </div>
        <div>
          <label className="label">Referencia / SKU</label>
          <input className="input" placeholder="TRO-35-001" {...f('referencia')} />
        </div>
        <div>
          <label className="label">Categoría</label>
          <select className="input" {...f('categoria')}>
            <option value="">Sin categoría</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Proveedor</label>
          <select className="input" {...f('proveedor_id')}>
            <option value="">Sin proveedor</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Unidad</label>
          <select className="input" {...f('unidad')}>
            {['ud', 'kg', 'g', 'm', 'cm', 'caja', 'pack', 'rollo'].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Precio de venta (con IVA) €</label>
          <input className="input" type="number" step="0.01" min="0" placeholder="0.00" {...f('precio_venta')} />
        </div>
        <div>
          <label className="label">Precio de compra €</label>
          <input className="input" type="number" step="0.01" min="0" placeholder="0.00" {...f('precio_compra')} />
        </div>
        <div>
          <label className="label">IVA %</label>
          <select className="input" {...f('iva_tasa')}>
            <option value={0}>0%</option>
            <option value={4}>4%</option>
            <option value={10}>10%</option>
            <option value={21}>21%</option>
          </select>
        </div>
        <div>
          <label className="label">Stock inicial / actual</label>
          <input className="input" type="number" step="0.001" min="0" {...f('stock_actual')} />
        </div>
        <div>
          <label className="label">Stock mínimo (alerta)</label>
          <input className="input" type="number" step="1" min="0" placeholder="0" {...f('stock_minimo')} />
          <p className="text-xs text-gray-600 mt-1">Recibirás aviso si baja de este número</p>
        </div>
        <div className="md:col-span-2">
          <label className="label">Descripción</label>
          <textarea className="input h-16 resize-none text-sm" placeholder="Descripción opcional..." {...f('descripcion')} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : '💾 Guardar'}
        </button>
      </div>
    </Modal>
  )
}

// ── Modal Proveedor ─────────────────────────────────────
function ModalProveedor({ proveedor, empresaId, onClose, onSaved }) {
  const [form, setForm] = useState({
    nombre: '', nif_cif: '', email: '', telefono: '',
    ciudad: '', direccion: '', web: '', notas: '', activo: true,
    ...proveedor, empresa_id: empresaId,
  })
  const [saving, setSaving] = useState(false)
  const f = (k) => ({ value: form[k] ?? '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) })

  const handleSave = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio')
    setSaving(true)
    await upsertProveedor(form)
    setSaving(false)
    onSaved()
  }

  return (
    <Modal title={!proveedor.id ? '+ Nuevo proveedor' : `✏️ ${proveedor.nombre}`} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="label">Nombre *</label>
          <input className="input" placeholder="Proveedor S.L." {...f('nombre')} />
        </div>
        <div>
          <label className="label">NIF / CIF</label>
          <input className="input" placeholder="B12345678" {...f('nif_cif')} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" placeholder="proveedor@email.com" {...f('email')} />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input className="input" placeholder="+34 600 000 000" {...f('telefono')} />
        </div>
        <div>
          <label className="label">Ciudad</label>
          <input className="input" placeholder="Madrid" {...f('ciudad')} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Dirección</label>
          <input className="input" placeholder="Calle Mayor 1" {...f('direccion')} />
        </div>
        <div>
          <label className="label">Web</label>
          <input className="input" placeholder="https://proveedor.com" {...f('web')} />
        </div>
        <div>
          <label className="label">Notas</label>
          <input className="input" placeholder="Notas internas" {...f('notas')} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : '💾 Guardar'}
        </button>
      </div>
    </Modal>
  )
}

// ── Modal Entrada Stock ─────────────────────────────────
function ModalEntrada({ producto, empresaId, onClose, onSaved }) {
  const [cantidad, setCantidad] = useState('')
  const [notas, setNotas]       = useState('')
  const [saving, setSaving]     = useState(false)

  const handleSave = async () => {
    const cant = Number(cantidad)
    if (!cant || cant <= 0) return alert('Introduce una cantidad válida')
    setSaving(true)
    await entradaStock(empresaId, producto.id, cant, notas)
    setSaving(false)
    onSaved()
  }

  return (
    <Modal title={`📥 Entrada de stock — ${producto.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="card text-center py-4">
          <div className="text-xs text-gray-500 mb-1">Stock actual</div>
          <div className="text-3xl font-bold text-white">{producto.stock_actual} <span className="text-lg text-gray-500">{producto.unidad}</span></div>
        </div>
        <div>
          <label className="label">Cantidad a añadir</label>
          <input className="input text-lg font-bold" type="number" step="1" min="1" placeholder="0"
            value={cantidad} onChange={e => setCantidad(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Notas (opcional)</label>
          <input className="input" placeholder="Ej: Pedido mayo 2026, albarán 1234"
            value={notas} onChange={e => setNotas(e.target.value)} />
        </div>
        {cantidad > 0 && (
          <div className="text-center text-sm text-green-400">
            Nuevo stock: <strong>{Number(producto.stock_actual) + Number(cantidad)} {producto.unidad}</strong>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : '📥 Añadir entrada'}
        </button>
      </div>
    </Modal>
  )
}

// ── Modal Ajuste Stock ──────────────────────────────────
function ModalAjuste({ producto, empresaId, onClose, onSaved }) {
  const [nuevoStock, setNuevoStock] = useState(producto.stock_actual)
  const [notas, setNotas]           = useState('')
  const [saving, setSaving]         = useState(false)

  const handleSave = async () => {
    if (nuevoStock === '' || nuevoStock === null) return alert('Introduce el stock correcto')
    setSaving(true)
    await ajusteStock(empresaId, producto.id, nuevoStock, notas || 'Ajuste manual')
    setSaving(false)
    onSaved()
  }

  const diff = Number(nuevoStock) - Number(producto.stock_actual)

  return (
    <Modal title={`✏️ Ajustar stock — ${producto.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="card text-center py-4">
          <div className="text-xs text-gray-500 mb-1">Stock actual</div>
          <div className="text-3xl font-bold text-white">{producto.stock_actual} <span className="text-lg text-gray-500">{producto.unidad}</span></div>
        </div>
        <div>
          <label className="label">Nuevo stock real</label>
          <input className="input text-lg font-bold" type="number" step="0.001" min="0"
            value={nuevoStock} onChange={e => setNuevoStock(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Motivo del ajuste</label>
          <input className="input" placeholder="Ej: Inventario físico, rotura, pérdida..."
            value={notas} onChange={e => setNotas(e.target.value)} />
        </div>
        {nuevoStock !== '' && diff !== 0 && (
          <div className={`text-center text-sm font-semibold ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
            Diferencia: {diff > 0 ? '+' : ''}{diff.toFixed(3)} {producto.unidad}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : '✅ Confirmar ajuste'}
        </button>
      </div>
    </Modal>
  )
}

// ── Modal base ──────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
        style={{ background: '#161410', border: '1px solid #2a2418' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #2a2418' }}>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
