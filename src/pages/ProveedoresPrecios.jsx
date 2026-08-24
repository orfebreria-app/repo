import { useEffect, useState } from 'react'
import {
  getProveedores, getEmpresa,
  getProductosPorProveedor, getCategoriasPorProveedor,
  actualizarProveedor, previsualizarPreciosProveedor, aplicarPreciosMasivos,
  formatEuro,
} from '../lib/supabase'

export default function ProveedoresPrecios({ session }) {
  const [empresa, setEmpresa] = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [proveedorId, setProveedorId] = useState('')
  const [proveedor, setProveedor] = useState(null)
  const [editando, setEditando] = useState(false)
  const [formProveedor, setFormProveedor] = useState({})
  const [guardando, setGuardando] = useState(false)

  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas')
  const [seleccionados, setSeleccionados] = useState([])
  const [coeficiente, setCoeficiente] = useState(2.5)
  const [respetarCoefProducto, setRespetarCoefProducto] = useState(true)
  const [forzarEnProducto, setForzarEnProducto] = useState(false)
  const [previsualizacion, setPrevisualizacion] = useState([])
  const [mensaje, setMensaje] = useState('')
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) {
        const { data: provs } = await getProveedores(emp.id)
        setProveedores(provs || [])
      }
    }
    init()
  }, [session])

  useEffect(() => {
    if (!proveedorId) { setProveedor(null); setProductos([]); setCategorias([]); return }
    const prov = proveedores.find(p => p.id === proveedorId)
    setProveedor(prov)
    setFormProveedor(prov || {})
    setCoeficiente(prov?.multiplicador_venta || 2.5)
    setEditando(false)
    cargarProductos(proveedorId)
  }, [proveedorId, proveedores])

  const cargarProductos = async (id) => {
    const { data: prods } = await getProductosPorProveedor(id)
    setProductos(prods || [])
    const { data: cats } = await getCategoriasPorProveedor(id)
    setCategorias(cats || [])
    setSeleccionados([])
    setPrevisualizacion([])
  }

  const guardarProveedor = async () => {
    setGuardando(true)
    setMensaje('')
    const { data, error } = await actualizarProveedor(proveedorId, {
      nombre: formProveedor.nombre,
      nif_cif: formProveedor.nif_cif,
      email: formProveedor.email,
      telefono: formProveedor.telefono,
      movil: formProveedor.movil,
      contacto: formProveedor.contacto,
      direccion: formProveedor.direccion,
      ciudad: formProveedor.ciudad,
      cp: formProveedor.cp,
      pais: formProveedor.pais,
      web: formProveedor.web,
      forma_pago: formProveedor.forma_pago,
      dias_pago: Number(formProveedor.dias_pago) || 30,
      multiplicador_venta: Number(formProveedor.multiplicador_venta) || 2.5,
      notas: formProveedor.notas,
      observaciones_internas: formProveedor.observaciones_internas,
      activo: formProveedor.activo,
    })
    setGuardando(false)
    if (error) { setMensaje('Error al guardar: ' + error.message); return }
    setProveedores(provs => provs.map(p => p.id === proveedorId ? data : p))
    setEditando(false)
    setMensaje('Proveedor actualizado correctamente.')
  }

  const productosFiltrados = categoriaFiltro === 'todas'
    ? productos
    : productos.filter(p => p.categoria === categoriaFiltro)

  const toggleSeleccion = (id) => {
    setSeleccionados(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const seleccionarTodosFiltrados = () => {
    setSeleccionados(productosFiltrados.map(p => p.id))
  }

  const limpiarSeleccion = () => setSeleccionados([])

  const generarPrevisualizacion = () => {
    const productosSeleccionados = productos.filter(p => seleccionados.includes(p.id))
    const preview = previsualizarPreciosProveedor({
      productos: productosSeleccionados,
      coeficiente,
      respetarCoeficienteProducto: respetarCoefProducto,
    })
    setPrevisualizacion(preview)
    setMensaje('')
  }

  const confirmarAplicacion = async () => {
    setAplicando(true)
    setMensaje('')
    const { resultados, error } = await aplicarPreciosMasivos({
      productosIds: previsualizacion,
      coeficiente,
      forzarCoeficienteEnProducto: forzarEnProducto,
    })
    setAplicando(false)
    if (error) { setMensaje(`Se aplicaron ${resultados.length - error.length} de ${resultados.length}. Hubo errores en algunos artículos.`); }
    else { setMensaje(`Precios actualizados en ${resultados.length} artículo(s).`) }
    setPrevisualizacion([])
    setSeleccionados([])
    cargarProductos(proveedorId)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Precios por proveedor</h1>
        <p className="text-sm text-gray-500">Edita la ficha del proveedor y aplica coeficientes de venta a sus artículos, por categoría o de forma individual.</p>
      </div>

      <div>
        <label className="label">Proveedor</label>
        <select className="input max-w-md" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
          <option value="">Selecciona un proveedor...</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      {mensaje && (
        <p className="text-sm bg-brand-500/10 border border-brand-500/30 rounded-lg px-3 py-2 text-brand-500">{mensaje}</p>
      )}

      {proveedor && (
        <>
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Ficha del proveedor</h2>
              {!editando ? (
                <button className="text-xs text-brand-500 hover:underline" onClick={() => setEditando(true)}>Editar</button>
              ) : (
                <div className="flex gap-3">
                  <button className="text-xs text-gray-400 hover:underline" onClick={() => { setEditando(false); setFormProveedor(proveedor) }}>Cancelar</button>
                  <button className="btn-primary text-xs px-3 py-1.5" disabled={guardando} onClick={guardarProveedor}>
                    {guardando ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Campo label="Nombre" value={formProveedor.nombre} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, nombre: v }))} />
              <Campo label="NIF/CIF" value={formProveedor.nif_cif} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, nif_cif: v }))} />
              <Campo label="Persona de contacto" value={formProveedor.contacto} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, contacto: v }))} />
              <Campo label="Email" value={formProveedor.email} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, email: v }))} />
              <Campo label="Teléfono" value={formProveedor.telefono} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, telefono: v }))} />
              <Campo label="Móvil" value={formProveedor.movil} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, movil: v }))} />
              <Campo label="Dirección" value={formProveedor.direccion} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, direccion: v }))} />
              <Campo label="Ciudad" value={formProveedor.ciudad} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, ciudad: v }))} />
              <Campo label="Código postal" value={formProveedor.cp} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, cp: v }))} />
              <Campo label="Web" value={formProveedor.web} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, web: v }))} />
              <Campo label="Forma de pago" value={formProveedor.forma_pago} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, forma_pago: v }))} />
              <Campo label="Días de pago" type="number" value={formProveedor.dias_pago} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, dias_pago: v }))} />
              <Campo label="Coeficiente de venta general" type="number" step="0.01" value={formProveedor.multiplicador_venta} disabled={!editando}
                onChange={v => setFormProveedor(f => ({ ...f, multiplicador_venta: v }))} />
            </div>

            <div>
              <label className="label">Observaciones</label>
              <textarea className="input" rows={2} disabled={!editando}
                value={formProveedor.notas || ''} onChange={e => setFormProveedor(f => ({ ...f, notas: e.target.value }))} />
            </div>
          </section>

          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-bold text-white">Artículos de este proveedor ({productos.length})</h2>

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="label">Categoría</label>
                <select className="input" value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}>
                  <option value="todas">Todas las categorías</option>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Coeficiente a aplicar</label>
                <input className="input w-32" type="number" step="0.01" min="0" value={coeficiente}
                  onChange={e => setCoeficiente(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-400 pb-2">
                <input type="checkbox" checked={respetarCoefProducto} onChange={e => setRespetarCoefProducto(e.target.checked)} />
                Respetar coeficiente propio del artículo si lo tiene
              </label>
              <div className="flex gap-3 pb-1">
                <button className="text-xs text-brand-500 hover:underline" onClick={seleccionarTodosFiltrados}>Seleccionar {categoriaFiltro === 'todas' ? 'todos' : 'esta categoría'}</button>
                <button className="text-xs text-gray-500 hover:underline" onClick={limpiarSeleccion}>Limpiar selección</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="py-2 px-2"></th>
                    <th className="py-2 px-2">Artículo</th>
                    <th className="py-2 px-2">Categoría</th>
                    <th className="py-2 px-2 text-right">Compra sin IVA</th>
                    <th className="py-2 px-2 text-right">Venta actual</th>
                    <th className="py-2 px-2 text-right">Coef. propio</th>
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.map(p => (
                    <tr key={p.id} className="border-b border-gray-900">
                      <td className="py-2 px-2">
                        <input type="checkbox" checked={seleccionados.includes(p.id)} onChange={() => toggleSeleccion(p.id)} />
                      </td>
                      <td className="py-2 px-2 text-gray-200">{p.nombre}</td>
                      <td className="py-2 px-2 text-gray-500">{p.categoria || '—'}</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-300">{formatEuro(p.precio_compra)}</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-300">{formatEuro(p.precio_venta)}</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-500">{p.multiplicador_venta || '—'}</td>
                    </tr>
                  ))}
                  {!productosFiltrados.length && (
                    <tr><td colSpan={6} className="py-6 text-center text-gray-600">No hay artículos en esta categoría.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-gray-600">{seleccionados.length} artículo(s) seleccionado(s)</span>
              <button className="btn-primary text-xs px-4 py-2" disabled={!seleccionados.length} onClick={generarPrevisualizacion}>
                Previsualizar nuevos precios
              </button>
            </div>
          </section>

          {previsualizacion.length > 0 && (
            <section className="bg-gray-900 border border-brand-500/40 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white">Previsualización antes de aplicar</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="py-2 px-2">Artículo</th>
                      <th className="py-2 px-2 text-right">Compra sin IVA</th>
                      <th className="py-2 px-2 text-right">Venta actual</th>
                      <th className="py-2 px-2 text-right">Coeficiente</th>
                      <th className="py-2 px-2 text-right">Venta propuesta</th>
                      <th className="py-2 px-2 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previsualizacion.map(p => (
                      <tr key={p.id} className="border-b border-gray-900">
                        <td className="py-2 px-2 text-gray-200">{p.nombre}</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-400">{formatEuro(p.precio_compra)}</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-400">{formatEuro(p.precio_venta_actual)}</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-400">×{p.coeficiente_aplicado}</td>
                        <td className="py-2 px-2 text-right font-mono text-white font-bold">{formatEuro(p.precio_venta_propuesto)}</td>
                        <td className={`py-2 px-2 text-right font-mono ${p.diferencia >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {p.diferencia >= 0 ? '+' : ''}{formatEuro(p.diferencia)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input type="checkbox" checked={forzarEnProducto} onChange={e => setForzarEnProducto(e.target.checked)} />
                Guardar también este coeficiente como el coeficiente propio de cada artículo
              </label>

              <div className="flex justify-end gap-3">
                <button className="text-xs text-gray-400 hover:underline" onClick={() => setPrevisualizacion([])}>Cancelar</button>
                <button className="btn-primary text-xs px-4 py-2" disabled={aplicando} onClick={confirmarAplicacion}>
                  {aplicando ? 'Aplicando...' : `Aplicar a ${previsualizacion.length} artículo(s)`}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Campo({ label, value, onChange, disabled, type = 'text', step }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type={type}
        step={step}
        disabled={disabled}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
