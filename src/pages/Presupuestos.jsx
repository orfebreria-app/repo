import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getEmpresa, getClientes, formatEuro, formatFecha } from '../lib/supabase'
import { generarPresupuestoPDF } from '../lib/presupuestoPDF'
import { format, addDays } from 'date-fns'
import ModalEnviarEmail from '../components/ModalEnviarEmail'

const ESTADOS = ['todos','borrador','enviado','aceptado','rechazado','caducado']
const badge = (e) => ({
  aceptado:  'bg-green-900/50 text-green-400 border-green-800',
  enviado:   'bg-blue-900/50 text-blue-400 border-blue-800',
  borrador:  'bg-gray-800 text-gray-400 border-gray-700',
  rechazado: 'bg-red-900/50 text-red-400 border-red-800',
  caducado:  'bg-orange-900/50 text-orange-400 border-orange-800',
}[e] || 'bg-gray-800 text-gray-400 border-gray-700')

const lineaVacia = () => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '', cantidad: 1, precio_unitario: '', iva_tasa: 21, descuento: 0,
})
const calcLinea = (l) => {
  const base = Number(l.cantidad) * Number(l.precio_unitario || 0)
  return +(base * (1 - Number(l.descuento) / 100)).toFixed(2)
}

export default function Presupuestos({ session }) {
  const navigate = useNavigate()
  const [empresa,   setEmpresa]   = useState(null)
  const [clientes,  setClientes]  = useState([])
  const [lista,     setLista]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filtro,    setFiltro]    = useState('todos')
  const [buscar,    setBuscar]    = useState('')
  const [modal,     setModal]     = useState(false) // 'nuevo' | false
  const [editando,  setEditando]  = useState(null)  // presupuesto completo a editar
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [emailPres, setEmailPres] = useState(null)

  const hoy = format(new Date(), 'yyyy-MM-dd')
  const [form, setForm] = useState({
    cliente_id: '', fecha_emision: hoy,
    fecha_validez: format(addDays(new Date(),30),'yyyy-MM-dd'),
    estado: 'borrador', notas: '', condiciones: '',
  })
  const [lineas, setLineas] = useState([lineaVacia()])

  const cargar = async (emp) => {
    const { data } = await supabase
      .from('presupuestos')
      .select('*, clientes(nombre,email)')
      .eq('empresa_id', emp.id)
      .order('creado_en', { ascending: false })
    setLista(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      if (emp) {
        await cargar(emp)
        const { data: cls } = await getClientes(emp.id)
        setClientes(cls)
        // Precargar condiciones por defecto de la plantilla
        const cond = emp.presupuesto_config?.condiciones || ''
        setForm(f => ({ ...f, condiciones: cond }))
      }
      setLoading(false)
    }
    init()
  }, [session])

  // Totales
  const subtotal = lineas.reduce((s,l) => s + calcLinea(l), 0)
  const ivaTotal = lineas.reduce((s,l) => s + +(calcLinea(l) * Number(l.iva_tasa) / 100).toFixed(2), 0)
  const total    = +(subtotal + ivaTotal).toFixed(2)

  const addLinea    = () => setLineas(l => [...l, lineaVacia()])
  const removeLinea = (id) => lineas.length > 1 && setLineas(l => l.filter(x => x._id !== id))
  const updateLinea = (id, f, v) => setLineas(l => l.map(x => x._id===id ? {...x,[f]:v} : x))

  const openNuevo = () => {
    const cond = empresa?.presupuesto_config?.condiciones || ''
    setForm({ cliente_id:'', fecha_emision:hoy, fecha_validez:format(addDays(new Date(),30),'yyyy-MM-dd'), estado:'borrador', notas:'', condiciones:cond })
    setLineas([lineaVacia()])
    setError('')
    setEditando(null)
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.cliente_id) return setError('Selecciona un cliente')
    if (lineas.some(l => !l.descripcion.trim() || !l.precio_unitario)) return setError('Completa todos los conceptos')
    setSaving(true)
    const numero = `${empresa.serie_presupuesto||'PRE'}-${String(empresa.siguiente_presupuesto||1).padStart(4,'0')}`

    const { data: pres, error: err } = await supabase
      .from('presupuestos')
      .insert({ empresa_id:empresa.id, cliente_id:form.cliente_id, numero, fecha_emision:form.fecha_emision, fecha_validez:form.fecha_validez||null, estado:form.estado, subtotal, iva_total:ivaTotal, total, notas:form.notas||null, condiciones:form.condiciones||null })
      .select().single()

    if (err) { setError(err.message); setSaving(false); return }

    await supabase.from('conceptos_presupuesto').insert(
      lineas.map((l,i) => ({ presupuesto_id:pres.id, descripcion:l.descripcion, cantidad:Number(l.cantidad), precio_unitario:Number(l.precio_unitario), iva_tasa:Number(l.iva_tasa), descuento:Number(l.descuento), subtotal:calcLinea(l), orden:i }))
    )
    await supabase.from('empresas').update({ siguiente_presupuesto:(empresa.siguiente_presupuesto||1)+1 }).eq('id',empresa.id)
    setEmpresa(e => ({ ...e, siguiente_presupuesto:(e.siguiente_presupuesto||1)+1 }))
    await cargar(empresa)
    setSaving(false)
    setModal(false)
  }

  const handleEstado = async (id, estado) => {
    await supabase.from('presupuestos').update({ estado }).eq('id', id)
    await cargar(empresa)
  }

  const handleEdit = async (id) => {
    const { data: pres } = await supabase
      .from('presupuestos')
      .select('*, conceptos_presupuesto(*)')
      .eq('id', id).single()
    if (!pres) return
    setForm({
      id: pres.id,
      cliente_id:    pres.cliente_id,
      fecha_emision: pres.fecha_emision,
      fecha_validez: pres.fecha_validez || '',
      estado:        pres.estado,
      notas:         pres.notas || '',
      condiciones:   pres.condiciones || '',
    })
    setLineas(pres.conceptos_presupuesto
      .sort((a,b) => a.orden - b.orden)
      .map(c => ({
        _id:            c.id,
        descripcion:    c.descripcion,
        cantidad:       c.cantidad,
        precio_unitario: c.precio_unitario,
        iva_tasa:       c.iva_tasa,
        descuento:      c.descuento || 0,
      }))
    )
    setError('')
    setEditando(pres)
    setModal(true)
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!form.cliente_id) return setError('Selecciona un cliente')
    if (lineas.some(l => !l.descripcion.trim() || !l.precio_unitario)) return setError('Completa todos los conceptos')
    setSaving(true)
    await supabase.from('presupuestos').update({
      cliente_id: form.cliente_id,
      fecha_emision: form.fecha_emision,
      fecha_validez: form.fecha_validez || null,
      estado: form.estado,
      subtotal, iva_total: ivaTotal, total,
      notas: form.notas || null,
      condiciones: form.condiciones || null,
    }).eq('id', editando.id)
    await supabase.from('conceptos_presupuesto').delete().eq('presupuesto_id', editando.id)
    await supabase.from('conceptos_presupuesto').insert(
      lineas.map((l,i) => ({ presupuesto_id: editando.id, descripcion: l.descripcion, cantidad: Number(l.cantidad), precio_unitario: Number(l.precio_unitario), iva_tasa: Number(l.iva_tasa), descuento: Number(l.descuento), subtotal: calcLinea(l), orden: i }))
    )
    await cargar(empresa)
    setSaving(false)
    setModal(false)
    setEditando(null)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este presupuesto?')) return
    await supabase.from('presupuestos').delete().eq('id', id)
    await cargar(empresa)
  }

  const handlePDF = async (id) => {
    const { data: pres } = await supabase
      .from('presupuestos')
      .select('*, clientes(*), conceptos_presupuesto(*)')
      .eq('id', id).single()
    if (!pres) return
    const doc = await generarPresupuestoPDF({ presupuesto: pres, empresa, conceptos: pres.conceptos_presupuesto })
    doc.save(`${pres.numero}.pdf`)
  }

  const handleConvertir = async (id) => {
    if (!confirm('¿Convertir este presupuesto en factura?')) return
    navigate(`/facturas/nueva?desde_presupuesto=${id}`)
  }

  const filtrados = lista
    .filter(p => filtro === 'todos' || p.estado === filtro)
    .filter(p => p.numero.toLowerCase().includes(buscar.toLowerCase()) || (p.clientes?.nombre||'').toLowerCase().includes(buscar.toLowerCase()))

  if (loading) return <Skeleton />

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">📋 Presupuestos</h1>
        <button onClick={openNuevo} className="btn-primary flex items-center gap-2">
          <span>+</span> Nuevo presupuesto
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {ESTADOS.map(e => (
          <button key={e} onClick={() => setFiltro(e)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize
              ${filtro===e ? 'bg-brand-500 text-gray-950' : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'}`}>
            {e==='todos' ? 'Todos' : e}
          </button>
        ))}
      </div>

      <input className="input max-w-sm" placeholder="🔍  Buscar por número o cliente..."
        value={buscar} onChange={e => setBuscar(e.target.value)} />

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm">{buscar||filtro!=='todos' ? 'Sin resultados' : 'Todavía no hay presupuestos.'}</p>
            {!buscar && filtro==='todos' && (
              <button onClick={openNuevo} className="text-brand-500 text-sm hover:underline mt-1">Crear primer presupuesto</button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Número','Cliente','Fecha','Válido hasta','Total','Estado',''].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-gray-300">{p.numero}</td>
                  <td className="py-3 px-4 text-white font-medium">{p.clientes?.nombre||'—'}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{formatFecha(p.fecha_emision)}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{formatFecha(p.fecha_validez)}</td>
                  <td className="py-3 px-4 font-bold text-white">{formatEuro(p.total)}</td>
                  <td className="py-3 px-4">
                    <select value={p.estado} onChange={e => handleEstado(p.id, e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border bg-transparent cursor-pointer ${badge(p.estado)}`}>
                      {['borrador','enviado','aceptado','rechazado','caducado'].map(s => (
                        <option key={s} value={s} className="bg-gray-900 text-gray-200">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => handleEdit(p.id)} className="text-xs text-gray-500 hover:text-brand-500 px-2 py-1 rounded hover:bg-gray-800 transition-colors" title="Editar">✏️</button>
                      <button onClick={() => handlePDF(p.id)} className="text-xs text-gray-500 hover:text-brand-500 px-2 py-1 rounded hover:bg-gray-800 transition-colors" title="Descargar PDF">📥 PDF</button>
                      <button onClick={() => setEmailPres(p)} className="text-xs text-gray-500 hover:text-blue-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors" title="Enviar por email">📧</button>
                      {p.estado === 'aceptado' && (
                        <button onClick={() => handleConvertir(p.id)} className="text-xs text-green-500 hover:text-green-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors" title="Convertir en factura">🧾 Facturar</button>
                      )}
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-gray-600 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtrados.length > 0 && (
        <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
          <span>{filtrados.length} presupuesto{filtrados.length!==1?'s':''}</span>
          <span>·</span>
          <span>Total: <strong className="text-white">{formatEuro(filtrados.reduce((s,p)=>s+Number(p.total),0))}</strong></span>
        </div>
      )}

      {/* Modal nuevo presupuesto */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/75" onClick={() => setModal(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-bold text-white">{editando ? `✏️ Editar ${editando.numero}` : 'Nuevo presupuesto'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{editando ? editando.numero : `Nº ${empresa?.serie_presupuesto||'PRE'}-${String(empresa?.siguiente_presupuesto||1).padStart(4,'0')}`}</p>
              </div>
              <button onClick={() => setModal(false)} className="text-gray-500 hover:text-white text-2xl">×</button>
            </div>

            <form onSubmit={editando ? handleSaveEdit : handleSave} className="p-6 space-y-6">
              {/* Datos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="label">Cliente *</label>
                  <select className="input" value={form.cliente_id} onChange={e => setForm({...form,cliente_id:e.target.value})} required>
                    <option value="">— Selecciona un cliente —</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Fecha de emisión</label>
                  <input type="date" className="input" value={form.fecha_emision} onChange={e => setForm({...form,fecha_emision:e.target.value})} />
                </div>
                <div>
                  <label className="label">Válido hasta</label>
                  <input type="date" className="input" value={form.fecha_validez} onChange={e => setForm({...form,fecha_validez:e.target.value})} />
                </div>
              </div>

              {/* Conceptos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm">Conceptos</h4>
                  <button type="button" onClick={addLinea} className="text-xs text-brand-500 hover:text-brand-600 font-semibold">+ Añadir</button>
                </div>
                <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase tracking-wide font-semibold pb-1 border-b border-gray-800">
                  <div className="col-span-4">Descripción</div>
                  <div className="col-span-2 text-right">Cant.</div>
                  <div className="col-span-2 text-right">Precio</div>
                  <div className="col-span-1 text-right">IVA</div>
                  <div className="col-span-1 text-right">Dto%</div>
                  <div className="col-span-1 text-right">Subtotal</div>
                  <div className="col-span-1"/>
                </div>
                {lineas.map(l => (
                  <div key={l._id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 md:col-span-4">
                      <input className="input text-sm" placeholder="Descripción" value={l.descripcion} onChange={e => updateLinea(l._id,'descripcion',e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <input className="input text-right text-sm" type="number" min="0" step="0.001" value={l.cantidad} onChange={e => updateLinea(l._id,'cantidad',e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <input className="input text-right text-sm" type="number" min="0" step="0.01" placeholder="0.00" value={l.precio_unitario} onChange={e => updateLinea(l._id,'precio_unitario',e.target.value)} />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <select className="input text-xs px-1" value={l.iva_tasa} onChange={e => updateLinea(l._id,'iva_tasa',e.target.value)}>
                        {[0,4,10,21].map(v=><option key={v} value={v}>{v}%</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <input className="input text-right text-sm" type="number" min="0" max="100" placeholder="0" value={l.descuento} onChange={e => updateLinea(l._id,'descuento',e.target.value)} />
                    </div>
                    <div className="col-span-1 text-right text-sm font-semibold text-white hidden md:block">
                      {formatEuro(calcLinea(l))}
                    </div>
                    <div className="col-span-2 md:col-span-1 flex justify-center">
                      <button type="button" onClick={() => removeLinea(l._id)} disabled={lineas.length===1} className="text-gray-600 hover:text-red-400 text-xl leading-none disabled:opacity-20">×</button>
                    </div>
                  </div>
                ))}

                {/* Totales */}
                <div className="flex justify-end pt-2">
                  <div className="bg-gray-800/50 rounded-xl p-4 space-y-1.5 min-w-[200px]">
                    <div className="flex justify-between text-sm text-gray-400"><span>Subtotal</span><span>{formatEuro(subtotal)}</span></div>
                    <div className="flex justify-between text-sm text-gray-400"><span>IVA</span><span>{formatEuro(ivaTotal)}</span></div>
                    <div className="flex justify-between font-bold text-white text-base border-t border-gray-700 pt-2"><span>TOTAL</span><span className="text-brand-500">{formatEuro(total)}</span></div>
                  </div>
                </div>
              </div>

              {/* Condiciones y notas */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Condiciones del presupuesto</label>
                  <textarea className="input h-24 resize-none text-sm" placeholder="Condiciones de pago, plazos de entrega..."
                    value={form.condiciones} onChange={e => setForm({...form,condiciones:e.target.value})} />
                  <p className="text-xs text-gray-600 mt-1">Edita las condiciones por defecto en Configuración → Plantilla presupuesto</p>
                </div>
                <div>
                  <label className="label">Notas internas</label>
                  <textarea className="input h-24 resize-none text-sm" placeholder="Notas opcionales..."
                    value={form.notas} onChange={e => setForm({...form,notas:e.target.value})} />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">⚠️ {error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setModal(false); setEditando(null) }} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary px-6" disabled={saving}>{saving ? 'Guardando...' : (editando ? '💾 Guardar cambios' : '💾 Guardar presupuesto')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {emailPres && (
        <ModalEnviarEmail
          tipo="presupuesto"
          numero={emailPres.numero}
          clienteEmail={emailPres.clientes?.email || ''}
          clienteNombre={emailPres.clientes?.nombre || ''}
          empresaNombre={empresa?.nombre || 'Trofeos AKA'}
          onClose={() => setEmailPres(null)}
        />
      )}
    </div>
  )
}

const Skeleton = () => (
  <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-40"/>
    <div className="h-48 bg-gray-800 rounded-xl"/>
  </div>
)
