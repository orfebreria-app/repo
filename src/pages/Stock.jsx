import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, getEmpresa, getProductos, upsertProducto, deleteProducto,
         getProveedores, upsertProveedor, deleteProveedor,
         getMovimientos, entradaStock, ajusteStock,
         getFacturasProveedor, createFacturaProveedor,
         updateEstadoFacturaProveedor, deleteFacturaProveedor,
         formatEuro, formatFecha } from '../lib/supabase'

const TABS = ['📦 Productos', '🏭 Proveedores', '🧾 Compras', '📋 Movimientos']

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

  const [modalProducto, setModalProducto] = useState(null)
  const [modalProveedor, setModalProveedor] = useState(null)
  const [modalEntrada, setModalEntrada]   = useState(null)
  const [modalAjuste, setModalAjuste]     = useState(null)
  const [modalCompra, setModalCompra]     = useState(false)
  const [compras, setCompras]             = useState([])
  const [imagenAmpliada, setImagenAmpliada] = useState(null)
  const [seccionesAbiertas, setSeccionesAbiertas] = useState({})

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
    const [r1, r2, r3, r4] = await Promise.all([
      getProductos(eid),
      getProveedores(eid),
      getMovimientos(eid),
      getFacturasProveedor(eid),
    ])
    setProductos(r1.data)
    setProveedores(r2.data)
    setMovimientos(r3.data)
    setCompras(r4.data)
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
          {tab === 2 && (
            <button onClick={() => setModalCompra(true)} className="btn-primary flex items-center gap-2">
              + Nueva compra
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

          {/* Secciones por prefijo de referencia */}
          {(() => {
            // Extraer prefijo: "TIENDA-001" → "TIENDA", "TRO 35" → "TRO", "" → "Sin sección"
            const getSeccion = (ref) => {
              if (!ref || !ref.trim()) return '📂 Sin sección'
              const partes = ref.trim().toUpperCase().split(/[-_\s\/]+/)
              return partes[0] || '📂 Sin sección'
            }

            // Agrupar
            const grupos = {}
            productosFiltrados.forEach(p => {
              const sec = getSeccion(p.referencia)
              if (!grupos[sec]) grupos[sec] = []
              grupos[sec].push(p)
            })

            const secciones = Object.keys(grupos).sort((a, b) => {
              if (a === '📂 Sin sección') return 1
              if (b === '📂 Sin sección') return -1
              return a.localeCompare(b)
            })

            if (secciones.length === 0) return (
              <div className="card text-center py-12 text-gray-600">No hay productos. Crea el primero →</div>
            )

            return (
              <div className="space-y-2">
                {/* Botón expandir/colapsar todo */}
                <div className="flex justify-end gap-2">
                  <button onClick={() => {
                    const todas = {}
                    secciones.forEach(s => todas[s] = true)
                    setSeccionesAbiertas(todas)
                  }} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800">
                    Expandir todo
                  </button>
                  <button onClick={() => setSeccionesAbiertas({})}
                    className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800">
                    Colapsar todo
                  </button>
                </div>

                {secciones.map(seccion => {
                  const prods = grupos[seccion]
                  const abierta = seccionesAbiertas[seccion] !== false // por defecto abierta
                  const sinStockCount = prods.filter(p => p.stock_actual <= 0).length
                  const bajoCount = prods.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo && p.stock_minimo > 0).length

                  return (
                    <div key={seccion} className="rounded-xl overflow-hidden" style={{ border: '1px solid #2a2418' }}>
                      {/* Cabecera de sección */}
                      <button
                        onClick={() => setSeccionesAbiertas(s => ({ ...s, [seccion]: !abierta }))}
                        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
                        style={{ background: '#1a1814' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-base" style={{ color: '#C9A84C' }}>{abierta ? '▼' : '▶'}</span>
                          <span className="font-bold text-white text-sm tracking-wide">{seccion}</span>
                          <span className="text-xs text-gray-500 font-normal">
                            {prods.length} {prods.length === 1 ? 'artículo' : 'artículos'}
                          </span>
                          {sinStockCount > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-red-900/50 text-red-400 border border-red-800">
                              {sinStockCount} sin stock
                            </span>
                          )}
                          {bajoCount > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-yellow-900/40 text-yellow-400 border border-yellow-800">
                              {bajoCount} bajo
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-600 font-mono">
                          {formatEuro(prods.reduce((s, p) => s + p.stock_actual * p.precio_compra, 0))}
                        </span>
                      </button>

                      {/* Filas de productos */}
                      {abierta && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ borderTop: '1px solid #2a2418', borderBottom: '1px solid #2a2418', background: '#161410' }}>
                              {['', 'Referencia', 'Producto', 'Categoría', 'Proveedor', 'Precio venta', 'Stock', 'Acciones'].map(h => (
                                <th key={h} className="text-left px-4 py-2 text-xs text-gray-600 uppercase tracking-wide font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {prods.map(p => {
                              const bajo = p.stock_actual <= p.stock_minimo && p.stock_minimo > 0
                              const sinStock = p.stock_actual <= 0
                              return (
                                <tr key={p.id} className="border-t transition-colors hover:bg-white/5" style={{ borderColor: '#1e1c18' }}>
                                  <td className="px-3 py-2 w-12">
                                    {p.imagen_url
                                      ? <img src={p.imagen_url} alt={p.nombre}
                                          onClick={() => setImagenAmpliada(p.imagen_url)}
                                          className="w-10 h-10 object-cover rounded-lg border border-gray-700 cursor-zoom-in hover:opacity-80 transition-opacity" />
                                      : <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600 text-lg">📦</div>
                                    }
                                  </td>
                                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.referencia || '—'}</td>
                                  <td className="px-4 py-3 font-medium text-white">{p.nombre}</td>
                                  <td className="px-4 py-3 text-gray-400 text-xs">{p.categoria || '—'}</td>
                                  <td className="px-4 py-3 text-gray-400 text-xs">{p.proveedores?.nombre || '—'}</td>
                                  <td className="px-4 py-3 text-white font-mono text-xs">{formatEuro(p.precio_venta)}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                      sinStock ? 'bg-red-900/50 text-red-400 border border-red-800' :
                                      bajo     ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800' :
                                                 'bg-green-900/30 text-green-400 border border-green-900'
                                    }`}>
                                      {p.stock_actual} {p.unidad}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex gap-1">
                                      <button onClick={() => setModalEntrada(p)} title="Entrada de stock"
                                        className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/60 border border-green-900 transition-colors">+</button>
                                      <button onClick={() => setModalAjuste(p)} title="Ajustar stock"
                                        className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700 transition-colors">✏️</button>
                                      <button onClick={() => setModalProducto(p)}
                                        className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700 transition-colors">⚙️</button>
                                      <button onClick={async () => {
                                        if (!confirm(`¿Eliminar "${p.nombre}"?`)) return
                                        await deleteProducto(p.id); await cargar(empresa.id)
                                      }} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/60 border border-red-900 transition-colors">🗑</button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
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

      {/* ── TAB COMPRAS ───────────────────────────────── */}
      {tab === 2 && (
        <div className="space-y-4">
          {/* KPIs compras */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total compras', valor: compras.length, icon: '🧾' },
              { label: 'Pendientes de pago', valor: compras.filter(c => c.estado === 'pendiente').length, icon: '⏳', alert: true },
              { label: 'Pagadas', valor: compras.filter(c => c.estado === 'pagada').length, icon: '✅' },
              { label: 'Total gastado', valor: formatEuro(compras.filter(c=>c.estado==='pagada').reduce((s,c)=>s+Number(c.total),0)), icon: '💸', small: true },
            ].map((k, i) => (
              <div key={i} className="card text-center py-3">
                <div className="text-2xl mb-1">{k.icon}</div>
                <div className={`text-xl font-bold ${k.alert && k.valor > 0 ? 'text-yellow-400' : 'text-white'} ${k.small ? 'text-base' : ''}`}>{k.valor}</div>
                <div className="text-xs text-gray-500">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Tabla compras */}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2418' }}>
                  {['Fecha', 'Proveedor', 'Nº Factura', 'Base', 'IVA', 'R.Equiv.', 'Total', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compras.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-600">No hay compras registradas. Crea la primera →</td></tr>
                )}
                {compras.map(c => {
                  const badgeClass = {
                    pendiente: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
                    pagada:    'bg-green-900/40 text-green-400 border-green-800',
                    vencida:   'bg-red-900/40 text-red-400 border-red-800',
                    cancelada: 'bg-gray-800 text-gray-500 border-gray-700',
                  }[c.estado] || 'bg-gray-800 text-gray-400 border-gray-700'
                  return (
                    <tr key={c.id} className="border-t hover:bg-white/5 transition-colors" style={{ borderColor: '#1e1c18' }}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatFecha(c.fecha_factura)}</td>
                      <td className="px-4 py-3 font-medium text-white">
                        {c.proveedores?.nombre || c.clientes?.nombre || <span className="text-gray-600">Sin emisor</span>}
                        {c.clientes?.nombre && <span className="ml-1 text-xs text-gray-500">(cliente)</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.numero || '—'}</td>
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{formatEuro(c.subtotal)}</td>
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{formatEuro(c.iva_total)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: '#C9A84C' }}>{formatEuro(c.recargo_total || 0)}</td>
                      <td className="px-4 py-3 font-bold text-white font-mono">{formatEuro(c.total)}</td>
                      <td className="px-4 py-3">
                        <select
                          value={c.estado}
                          onChange={async (e) => {
                            await updateEstadoFacturaProveedor(c.id, e.target.value)
                            await cargar(empresa.id)
                          }}
                          className={`text-xs px-2 py-1 rounded-lg border bg-transparent cursor-pointer ${badgeClass}`}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="pagada">Pagada</option>
                          <option value="vencida">Vencida</option>
                          <option value="cancelada">Cancelada</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={async () => {
                          if (!confirm('¿Eliminar esta factura de compra?')) return
                          await deleteFacturaProveedor(c.id)
                          await cargar(empresa.id)
                        }} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/60 border border-red-900 transition-colors">
                          🗑
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB MOVIMIENTOS ───────────────────────────── */}
      {tab === 3 && (
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

      {/* ── MODAL COMPRA ──────────────────────────────── */}
      {modalCompra && (
        <ModalCompra
          proveedores={proveedores}
          productos={productos}
          empresaId={empresa.id}
          onClose={() => setModalCompra(false)}
          onSaved={() => { setModalCompra(false); cargar(empresa.id) }}
        />
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

      {/* ── LIGHTBOX IMAGEN (lista) ───────────────────── */}
      {imagenAmpliada && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setImagenAmpliada(null)}>
          <div className="relative flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <img src={imagenAmpliada} alt="Producto"
              style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '12px', border: '1px solid #374151' }} />
            <button onClick={() => setImagenAmpliada(null)}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              ✕ Cerrar
            </button>
          </div>
        </div>,
        document.body
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
    proveedor_id: '', activo: true, imagen_url: '',
    ...producto,
    empresa_id: empresaId,
  })
  const [saving, setSaving] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [verImagen, setVerImagen] = useState(false)

  const f = (k) => ({ value: form[k] ?? '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) })

  const handleImagen = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return alert('La imagen no puede superar 3 MB')
    setUploadingImg(true)
    const ext = file.name.split('.').pop()
    const path = `${empresaId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('productos').upload(path, file, { upsert: true })
    if (upErr) { alert('Error al subir imagen: ' + upErr.message); setUploadingImg(false); return }
    const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path)
    setForm(p => ({ ...p, imagen_url: publicUrl }))
    setUploadingImg(false)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio')
    setSaving(true)
    // Limpiar campos del join (proveedores) que no pertenecen a la tabla
    const { proveedores: _, ...formLimpio } = form
    const payload = {
      ...formLimpio,
      precio_venta:  Number(form.precio_venta)  || 0,
      precio_compra: Number(form.precio_compra) || 0,
      iva_tasa:      Number(form.iva_tasa)      || 21,
      stock_actual:  Number(form.stock_actual)  || 0,
      stock_minimo:  Number(form.stock_minimo)  || 0,
      proveedor_id:  form.proveedor_id || null,
      imagen_url:    form.imagen_url || null,
    }
    const { error } = await upsertProducto(payload)
    if (error) { alert('Error al guardar: ' + error.message); setSaving(false); return }
    setSaving(false)
    onSaved()
  }

  return (
    <>
    <Modal title={esNuevo ? '+ Nuevo producto' : `✏️ ${producto.nombre}`} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Imagen del producto */}
        <div className="md:col-span-2">
          <label className="label">Foto del producto</label>
          <div className="flex items-center gap-4 p-3 rounded-lg" style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid #2a2418' }}>
            {form.imagen_url ? (
              <div className="relative flex-shrink-0 group">
                <img src={form.imagen_url} alt="Producto"
                  onClick={() => setVerImagen(true)}
                  className="w-24 h-24 object-cover rounded-lg border border-gray-700 cursor-zoom-in transition-opacity group-hover:opacity-80" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-lg bg-black/40">
                  <span className="text-white text-xs font-bold">🔍 Ver</span>
                </div>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, imagen_url: '' }))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center hover:bg-red-500 font-bold z-10">
                  ×
                </button>
              </div>
            ) : (
              <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-600 flex-shrink-0 bg-gray-800/50">
                <span className="text-3xl">📷</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)' }}>
                {uploadingImg
                  ? <><span className="animate-pulse">⏳</span> Subiendo...</>
                  : <>{form.imagen_url ? '🔄 Cambiar foto' : '📷 Subir foto'}</>
                }
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden" onChange={handleImagen} disabled={uploadingImg} />
              </label>
              {form.imagen_url && (
                <button type="button" onClick={() => setVerImagen(true)}
                  className="text-xs text-gray-400 hover:text-white underline text-left">
                  🔍 Ver tamaño completo
                </button>
              )}
              <p className="text-xs text-gray-600">JPG, PNG o WebP · máx. 3 MB</p>
            </div>
          </div>
        </div>

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

    {/* Lightbox via Portal — se renderiza en body, sin overflow-hidden */}
    {verImagen && form.imagen_url && createPortal(
      <div className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 9999, background: 'rgba(0,0,0,0.92)' }}
        onClick={() => setVerImagen(false)}>
        <div className="relative flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
          <img src={form.imagen_url} alt="Producto"
            style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '12px', border: '1px solid #374151' }} />
          <button onClick={() => setVerImagen(false)}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            ✕ Cerrar
          </button>
        </div>
      </div>,
      document.body
    )}
  </>
  )
}

// ── Modal Proveedor ─────────────────────────────────────
function ModalProveedor({ proveedor, empresaId, onClose, onSaved }) {
  const [form, setForm] = useState({
    nombre: '', nif_cif: '', email: '', telefono: '',
    ciudad: '', cp: '', pais: 'España', direccion: '', web: '', notas: '', activo: true,
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        <div>
          <label className="label">Código Postal</label>
          <input className="input" placeholder="28001" maxLength={10} {...f('cp')} />
        </div>
        <div>
          <label className="label">País</label>
          <input className="input" placeholder="España" {...f('pais')} />
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
      <div className="flex justify-end gap-3 pt-3">
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


// ── Modal Compra / Factura Proveedor ───────────────────
function ModalCompra({ proveedores, productos, empresaId, onClose, onSaved }) {
  const RECARGO = { 21: 5.2, 10: 1.4, 4: 0.5, 0: 0 }

  const lineaVacia = () => ({
    _id: Math.random().toString(36).slice(2),
    descripcion: '', cantidad: 1, precio_unitario: '',
    iva_tasa: 21, recargo_tasa: 0, producto_id: null,
  })

  const [form, setForm] = useState({
    proveedor_id: '', numero: '', fecha_factura: new Date().toISOString().slice(0,10),
    estado: 'pendiente', notas: '',
  })
  const [vencimientos, setVencimientos] = useState([{ _id: '1', fecha: '', importe: '', notas: '' }])
  const [lineas, setLineas]     = useState([lineaVacia()])
  const [saving, setSaving]     = useState(false)
  const [busq, setBusq]         = useState('')
  const [lineaActiva, setLineaActiva] = useState(null)

  const calcLinea = (l) => {
    const base    = +(Number(l.cantidad) * Number(l.precio_unitario || 0)).toFixed(2)
    const iva     = +(base * Number(l.iva_tasa)      / 100).toFixed(2)
    const recargo = +(base * Number(l.recargo_tasa)  / 100).toFixed(2)
    return { base, iva, recargo, total: +(base + iva + recargo).toFixed(2) }
  }

  const subtotal     = lineas.reduce((s, l) => s + calcLinea(l).base,    0)
  const ivaTotal     = lineas.reduce((s, l) => s + calcLinea(l).iva,     0)
  const recargoTotal = lineas.reduce((s, l) => s + calcLinea(l).recargo, 0)
  const total        = +(subtotal + ivaTotal + recargoTotal).toFixed(2)

  const addLinea    = () => setLineas(l => [...l, lineaVacia()])
  const removeLinea = (id) => lineas.length > 1 && setLineas(l => l.filter(x => x._id !== id))
  const updateLinea = (id, field, val) => setLineas(l => l.map(x => {
    if (x._id !== id) return x
    const updated = { ...x, [field]: val }
    if (field === 'iva_tasa') updated.recargo_tasa = 0 // reset RE al cambiar IVA
    return updated
  }))

  const prodsFiltrados = busq.length > 1
    ? productos.filter(p => p.nombre.toLowerCase().includes(busq.toLowerCase()) || (p.referencia||'').toLowerCase().includes(busq.toLowerCase()))
    : []

  const seleccionar = (prod, lineaId) => {
    const ivaTasa = prod.iva_tasa || 21
    setLineas(l => l.map(x => x._id === lineaId ? {
      ...x, descripcion: prod.nombre,
      precio_unitario: prod.precio_compra || prod.precio_venta || '',
      iva_tasa: ivaTasa, recargo_tasa: 0, producto_id: prod.id,
    } : x))
    setBusq(''); setLineaActiva(null)
  }

  const handleSave = async () => {
    if (lineas.some(l => !l.descripcion.trim() || !l.precio_unitario)) return alert('Completa todos los conceptos')
    // Validar plazos: si tienen fecha deben tener importe
    const plazosValidos = vencimientos.filter(v => v.fecha || v.importe)
    if (plazosValidos.some(v => !v.fecha || !v.importe)) return alert('Cada plazo de vencimiento necesita fecha e importe')
    setSaving(true)
    const facturaData = {
      empresa_id: empresaId,
      proveedor_id: form.proveedor_id || null,
      numero: form.numero || null,
      fecha_factura: form.fecha_factura,
      fecha_vencimiento: plazosValidos[0]?.fecha || null, // primer plazo como fecha principal
      estado: form.estado,
      subtotal, iva_total: ivaTotal, recargo_total: recargoTotal, total,
      notas: form.notas || null,
    }
    const lineasData = lineas.map((l, i) => {
      const { base, recargo } = calcLinea(l)
      return {
        descripcion: l.descripcion, cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario), iva_tasa: Number(l.iva_tasa),
        recargo_tasa: Number(l.recargo_tasa), recargo_importe: recargo,
        subtotal: base, producto_id: l.producto_id || null, orden: i,
      }
    })
    const { error } = await createFacturaProveedor(facturaData, lineasData, plazosValidos)
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <Modal title="🧾 Nueva factura de compra" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Proveedor</label>
          <select className="input" value={form.proveedor_id} onChange={e => setForm(f => ({...f, proveedor_id: e.target.value}))}>
            <option value="">Sin proveedor</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Nº factura del proveedor</label>
          <input className="input font-mono" placeholder="Ej: A-2026-001"
            value={form.numero} onChange={e => setForm(f => ({...f, numero: e.target.value}))} />
        </div>
        <div>
          <label className="label">Fecha factura</label>
          <input type="date" className="input" value={form.fecha_factura}
            onChange={e => setForm(f => ({...f, fecha_factura: e.target.value}))} />
        </div>
        <div>
          <label className="label">Fecha vencimiento</label>
          <input type="date" className="input" value={form.fecha_vencimiento}
            onChange={e => setForm(f => ({...f, fecha_vencimiento: e.target.value}))} />
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input" value={form.estado} onChange={e => setForm(f => ({...f, estado: e.target.value}))}>
            <option value="pendiente">Pendiente</option>
            <option value="pagada">Pagada</option>
          </select>
        </div>
        <div>
          <label className="label">Notas</label>
          <input className="input" placeholder="Notas opcionales..."
            value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} />
        </div>
      </div>

      {/* Plazos de vencimiento */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <label className="label mb-0">📅 Vencimientos / Plazos de pago</label>
          <button type="button"
            onClick={() => setVencimientos(v => [...v, { _id: Math.random().toString(36).slice(2), fecha: '', importe: '', notas: '' }])}
            className="text-xs font-semibold" style={{ color: '#C9A84C' }}>
            + Añadir plazo
          </button>
        </div>
        <div className="space-y-2">
          {vencimientos.map((v, i) => (
            <div key={v._id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg" style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)' }}>
              <div className="col-span-1 text-xs text-center font-bold" style={{ color: '#C9A84C' }}>
                {i + 1}
              </div>
              <div className="col-span-4">
                <label className="text-xs text-gray-500 mb-0.5 block">Fecha</label>
                <input type="date" className="input text-sm"
                  value={v.fecha}
                  onChange={e => setVencimientos(vs => vs.map(x => x._id === v._id ? {...x, fecha: e.target.value} : x))} />
              </div>
              <div className="col-span-3">
                <label className="text-xs text-gray-500 mb-0.5 block">Importe €</label>
                <input type="number" className="input text-sm text-right" placeholder="0.00" min="0" step="0.01"
                  value={v.importe}
                  onChange={e => setVencimientos(vs => vs.map(x => x._id === v._id ? {...x, importe: e.target.value} : x))} />
              </div>
              <div className="col-span-3">
                <label className="text-xs text-gray-500 mb-0.5 block">Nota (opt.)</label>
                <input className="input text-sm" placeholder="Ej: 1er plazo"
                  value={v.notas}
                  onChange={e => setVencimientos(vs => vs.map(x => x._id === v._id ? {...x, notas: e.target.value} : x))} />
              </div>
              <div className="col-span-1 flex justify-center pt-4">
                <button type="button" onClick={() => vencimientos.length > 1 && setVencimientos(vs => vs.filter(x => x._id !== v._id))}
                  className="text-gray-600 hover:text-red-400 text-lg leading-none disabled:opacity-20"
                  disabled={vencimientos.length === 1}>×</button>
              </div>
            </div>
          ))}
        </div>
        {/* Resumen importes vs total */}
        {(() => {
          const sumPlazos = vencimientos.reduce((s, v) => s + Number(v.importe || 0), 0)
          const diff = +(total - sumPlazos).toFixed(2)
          if (total === 0) return null
          return (
            <div className="flex justify-end gap-4 text-xs pt-1">
              <span className="text-gray-500">Total factura: <strong className="text-white">{formatEuro(total)}</strong></span>
              <span className="text-gray-500">Plazos: <strong className="text-white">{formatEuro(sumPlazos)}</strong></span>
              {diff !== 0 && <span style={{ color: diff > 0 ? '#f87171' : '#C9A84C' }}>
                {diff > 0 ? `Falta: ${formatEuro(diff)}` : `Exceso: ${formatEuro(Math.abs(diff))}`}
              </span>}
              {diff === 0 && <span className="text-green-400">✓ Cuadrado</span>}
            </div>
          )
        })()}
      </div>

      {/* Líneas */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <label className="label mb-0">Conceptos / Productos</label>
          <button type="button" onClick={addLinea} className="text-xs font-semibold" style={{ color: '#C9A84C' }}>+ Añadir línea</button>
        </div>

        {/* Cabecera columnas */}
        <div className="hidden md:grid gap-2 text-xs text-gray-500 uppercase tracking-wide pb-1"
          style={{ gridTemplateColumns: '3fr 1fr 1fr 1fr 1fr 1fr auto', borderBottom: '1px solid #2a2418' }}>
          <div>Descripción</div>
          <div className="text-right">Cant.</div>
          <div className="text-right">Precio unit.</div>
          <div className="text-center">IVA %</div>
          <div className="text-center">RE %</div>
          <div className="text-right">Total</div>
          <div/>
        </div>

        {lineas.map((l) => {
          const busqActiva = lineaActiva === l._id && busq.length > 1
          const { base, iva, recargo, total: totLinea } = calcLinea(l)
          return (
            <div key={l._id} className="hidden md:grid gap-2 items-center"
              style={{ gridTemplateColumns: '3fr 1fr 1fr 1fr 1fr 1fr auto' }}>
              {/* Descripción */}
              <div className="relative">
                <input className="input text-sm w-full"
                  placeholder="Descripción o busca producto..."
                  value={lineaActiva === l._id ? busq : l.descripcion}
                  onChange={e => {
                    if (lineaActiva === l._id) { setBusq(e.target.value) }
                    else { updateLinea(l._id, 'descripcion', e.target.value); if (e.target.value.length > 1) { setLineaActiva(l._id); setBusq(e.target.value) } }
                  }}
                  onFocus={() => { if (l.descripcion.length > 1) { setLineaActiva(l._id); setBusq(l.descripcion) } }}
                  onBlur={() => setTimeout(() => setLineaActiva(null), 200)}
                />
                {busqActiva && prodsFiltrados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 rounded-lg shadow-xl mt-1 overflow-hidden"
                    style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
                    {prodsFiltrados.slice(0, 5).map(p => (
                      <button key={p.id} type="button" onMouseDown={() => seleccionar(p, l._id)}
                        className="w-full text-left px-3 py-2 hover:bg-white/5 flex justify-between items-center">
                        <div>
                          <div className="text-sm text-white">{p.nombre}</div>
                          <div className="text-xs text-gray-500">{p.referencia || ''}</div>
                        </div>
                        <div className="text-xs text-gray-400">Compra: {formatEuro(p.precio_compra)}</div>
                      </button>
                    ))}
                  </div>
                )}
                {l.producto_id && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#C9A84C' }}>📦</span>}
              </div>

              {/* Cantidad */}
              <input className="input text-right text-sm" type="number" min="0.001" step="0.001"
                value={l.cantidad} onChange={e => updateLinea(l._id, 'cantidad', e.target.value)} />

              {/* Precio */}
              <input className="input text-right text-sm" type="number" min="0" step="0.01" placeholder="0.00"
                value={l.precio_unitario} onChange={e => updateLinea(l._id, 'precio_unitario', e.target.value)} />

              {/* IVA */}
              <select className="input text-xs text-center px-1" value={l.iva_tasa}
                onChange={e => updateLinea(l._id, 'iva_tasa', e.target.value)}>
                {[0,4,10,21].map(v => <option key={v} value={v}>{v}%</option>)}
              </select>

              {/* RE — botón ON/OFF que aplica la tasa legal o 0 */}
              <button type="button"
                onClick={() => updateLinea(l._id, 'recargo_tasa',
                  Number(l.recargo_tasa) > 0 ? 0 : (RECARGO[Number(l.iva_tasa)] ?? 0)
                )}
                title={Number(l.recargo_tasa) > 0 ? `RE ${l.recargo_tasa}% — click para quitar` : 'Click para añadir Recargo de Equivalencia'}
                className="w-full py-1.5 rounded-lg text-xs font-bold border transition-all"
                style={Number(l.recargo_tasa) > 0
                  ? { background: 'rgba(201,168,76,0.2)', color: '#C9A84C', borderColor: 'rgba(201,168,76,0.5)' }
                  : { background: 'transparent', color: '#6b7280', borderColor: '#374151' }
                }>
                {Number(l.recargo_tasa) > 0 ? `${l.recargo_tasa}%` : 'RE'}
              </button>

              {/* Total */}
              <div className="text-right">
                <div className="text-sm font-semibold text-white">{formatEuro(totLinea)}</div>
                {recargo > 0 && <div className="text-xs" style={{ color: '#C9A84C' }}>+{formatEuro(recargo)} RE</div>}
              </div>

              {/* Borrar */}
              <button type="button" onClick={() => removeLinea(l._id)} disabled={lineas.length === 1}
                className="text-gray-600 hover:text-red-400 text-xl leading-none disabled:opacity-20">×</button>
            </div>
          )
        })}

        {/* Vista móvil (simplificada) */}
        <div className="md:hidden space-y-3">
          {lineas.map((l) => {
            const { totLinea } = calcLinea(l)
            return (
              <div key={l._id + '_m'} className="card space-y-2 p-3">
                <input className="input text-sm w-full" placeholder="Descripción..."
                  value={l.descripcion} onChange={e => updateLinea(l._id, 'descripcion', e.target.value)} />
                <div className="grid grid-cols-3 gap-2">
                  <input className="input text-right text-sm" type="number" placeholder="Cant."
                    value={l.cantidad} onChange={e => updateLinea(l._id, 'cantidad', e.target.value)} />
                  <input className="input text-right text-sm" type="number" placeholder="Precio"
                    value={l.precio_unitario} onChange={e => updateLinea(l._id, 'precio_unitario', e.target.value)} />
                  <select className="input text-xs" value={l.iva_tasa} onChange={e => updateLinea(l._id, 'iva_tasa', e.target.value)}>
                    {[0,4,10,21].map(v => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </div>
                <div className="flex justify-between items-center">
                  <button type="button"
                    onClick={() => updateLinea(l._id, 'recargo_tasa', Number(l.recargo_tasa) > 0 ? 0 : (RECARGO[Number(l.iva_tasa)] ?? 0))}
                    className="text-xs px-3 py-1 rounded-lg border font-semibold transition-all"
                    style={Number(l.recargo_tasa) > 0
                      ? { background: 'rgba(201,168,76,0.2)', color: '#C9A84C', borderColor: 'rgba(201,168,76,0.5)' }
                      : { color: '#6b7280', borderColor: '#374151' }}>
                    {Number(l.recargo_tasa) > 0 ? `✓ RE ${l.recargo_tasa}%` : '+ Rec. Equiv.'}
                  </button>
                  <button type="button" onClick={() => removeLinea(l._id)} disabled={lineas.length === 1}
                    className="text-red-400 text-sm disabled:opacity-20">Eliminar</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Totales */}
      <div className="flex flex-wrap justify-end gap-4 text-sm pt-3" style={{ borderTop: '1px solid #2a2418' }}>
        <span className="text-gray-400">Subtotal: <strong className="text-white ml-1">{formatEuro(subtotal)}</strong></span>
        <span className="text-gray-400">IVA: <strong className="text-white ml-1">{formatEuro(ivaTotal)}</strong></span>
        {recargoTotal > 0 && (
          <span className="font-semibold" style={{ color: '#C9A84C' }}>
            Rec. Equiv.: <strong className="ml-1">{formatEuro(recargoTotal)}</strong>
          </span>
        )}
        <span className="text-gray-400">TOTAL: <strong className="text-lg ml-1" style={{ color: '#C9A84C' }}>{formatEuro(total)}</strong></span>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : '💾 Guardar compra'}
        </button>
      </div>
    </Modal>
  )
}

// v-secciones
