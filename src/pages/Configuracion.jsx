import { useEffect, useState } from 'react'
import { getEmpresa, upsertEmpresa, supabase } from '../lib/supabase'
import { PLANTILLAS, COLORES } from '../lib/pdfGenerator'

const empty = {
  nombre: '', nif_cif: '', email: '', telefono: '',
  direccion: '', ciudad: '', cp: '', pais: 'España',
  moneda: 'EUR', serie: 'FAC', iva_default: 21,
  serie_presupuesto: 'PRE',
  recargo_equivalencia: false,
  factura_config: {
    plantilla: 'moderna',
    colorId: 'azul',
    textoPie: '',
    formaPago: '',
    notas: '',
  },
  presupuesto_config: {
    plantilla: 'moderna',
    color: '#C9A84C',
    titulo: 'PRESUPUESTO',
    textoValidez: 'Este presupuesto tiene una validez de 30 días desde su fecha de emisión.',
    textoPie: '¡Gracias por confiar en nosotros!',
    condiciones: '',
  }
}

export default function Configuracion({ session }) {
  const [form, setForm]     = useState(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return setError('El logo no puede superar 2 MB')
    setUploadingLogo(true)
    setError('')
    const ext = file.name.split('.').pop()
    const path = `logos/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (upErr) { setError('Error al subir logo: ' + upErr.message); setUploadingLogo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    setForm(f => ({ ...f, logo_url: publicUrl }))
    setUploadingLogo(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data } = await getEmpresa(session.user.id)
      if (data) setForm(data)
      setLoading(false)
    }
    init()
  }, [session])

  const f = (field) => ({
    value: form[field] ?? '',
    onChange: e => setForm({ ...form, [field]: e.target.value })
  })

  // Helper para campos dentro de presupuesto_config
  const pc = (field) => ({
    value: form.presupuesto_config?.[field] ?? '',
    onChange: e => setForm({ ...form, presupuesto_config: { ...(form.presupuesto_config||{}), [field]: e.target.value } })
  })

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return setError('El nombre de la empresa es obligatorio')
    setSaving(true)
    setError('')
    const { error: err } = await upsertEmpresa({ ...form, user_id: session.user.id })
    if (err) { setError(err.message); setSaving(false); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

  if (loading) return <Skeleton />

  return (
    <form onSubmit={handleSave} className="max-w-2xl mx-auto space-y-6">

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">⚙️ Configuración</h1>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : saved ? '✅ Guardado' : '💾 Guardar cambios'}
        </button>
      </div>

      {/* Logo empresa */}
      <div className="card space-y-4">
        <h2 className="font-bold text-white">Logo de empresa</h2>
        <p className="text-xs text-gray-500">Aparecerá en todas tus facturas PDF. Formatos: PNG, JPG. Máx. 2 MB.</p>
        <div className="flex items-center gap-5 flex-wrap">
          {form.logo_url ? (
            <div className="relative">
              <img src={form.logo_url} alt="Logo" className="max-h-20 max-w-[200px] w-auto h-auto object-contain rounded-lg border border-gray-700 bg-gray-800 p-2" />
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, logo_url: null }))}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-500"
              >×</button>
            </div>
          ) : (
            <div className="w-32 h-20 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center text-gray-600 text-xs text-center p-2">
              Sin logo
            </div>
          )}
          <div>
            <label className="btn-secondary cursor-pointer flex items-center gap-2 text-sm">
              {uploadingLogo ? (
                <><span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Subiendo...</>
              ) : (
                <>📁 {form.logo_url ? 'Cambiar logo' : 'Subir logo'}</>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
            <p className="text-xs text-gray-600 mt-2">PNG o JPG con fondo transparente recomendado</p>
          </div>
        </div>
      </div>

      {/* Datos fiscales */}
      <div className="card space-y-4">
        <h2 className="font-bold text-white">Datos de la empresa</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">Nombre / Razón social *</label>
            <input className="input" placeholder="Mi Empresa S.L." {...f('nombre')} required />
          </div>
          <div>
            <label className="label">NIF / CIF</label>
            <input className="input" placeholder="B12345678" {...f('nif_cif')} />
          </div>
          <div>
            <label className="label">Email de contacto</label>
            <input className="input" type="email" placeholder="empresa@email.com" {...f('email')} />
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
            <label className="label">Dirección fiscal</label>
            <input className="input" placeholder="Calle Mayor 1, 2ºA" {...f('direccion')} />
          </div>
          <div>
            <label className="label">Código postal</label>
            <input className="input" placeholder="28001" {...f('cp')} />
          </div>
          <div>
            <label className="label">País</label>
            <input className="input" {...f('pais')} />
          </div>
        </div>
      </div>

      {/* Config facturas */}
      <div className="card space-y-4">
        <h2 className="font-bold text-white">Configuración de facturas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Serie de facturas</label>
            <input className="input font-mono" placeholder="FAC" maxLength={10} {...f('serie')} />
            <p className="text-xs text-gray-600 mt-1">Ejemplo: FAC-0001</p>
          </div>
          <div>
            <label className="label">Serie de presupuestos</label>
            <input className="input font-mono" placeholder="PRE" maxLength={10} {...f('serie_presupuesto')} />
            <p className="text-xs text-gray-600 mt-1">Ejemplo: PRE-0001</p>
          </div>
          <div>
            <label className="label">Moneda</label>
            <select className="input" {...f('moneda')}>
              <option value="EUR">EUR — Euro (€)</option>
              <option value="USD">USD — Dólar ($)</option>
              <option value="GBP">GBP — Libra (£)</option>
              <option value="MXN">MXN — Peso mexicano</option>
            </select>
          </div>
          <div>
            <label className="label">IVA por defecto (%)</label>
            <select className="input" {...f('iva_default')}>
              <option value="0">0%</option>
              <option value="4">4% (Superreducido)</option>
              <option value="10">10% (Reducido)</option>
              <option value="21">21% (General)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Recargo de equivalencia</label>
            <div className="flex items-start gap-4 mt-1">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input type="checkbox" className="sr-only"
                    checked={!!form.recargo_equivalencia}
                    onChange={e => setForm({...form, recargo_equivalencia: e.target.checked})} />
                  <div className={`w-12 h-6 rounded-full transition-all ${form.recargo_equivalencia ? '' : 'bg-gray-700'}`}
                    style={form.recargo_equivalencia ? { background: 'linear-gradient(135deg,#C9A84C,#a8882e)' } : {}}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.recargo_equivalencia ? 'translate-x-6' : ''}`} />
                  </div>
                </div>
                <span className={`text-sm font-medium ${form.recargo_equivalencia ? 'text-white' : 'text-gray-500'}`}>
                  {form.recargo_equivalencia ? 'Activado' : 'Desactivado'}
                </span>
              </label>
              {form.recargo_equivalencia && (
                <div className="flex gap-2 flex-wrap text-xs">
                  {[{iva:21,re:5.2},{iva:10,re:1.4},{iva:4,re:0.5}].map(({iva,re}) => (
                    <span key={iva} className="px-2 py-1 rounded-lg border" style={{ background:'rgba(201,168,76,0.1)', borderColor:'rgba(201,168,76,0.3)', color:'#C9A84C' }}>
                      IVA {iva}% + RE {re}%
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Régimen especial para minoristas. Se aplica sobre la base imponible además del IVA (21%→5,2% · 10%→1,4% · 4%→0,5%).
            </p>
          </div>
        </div>
      </div>

      {/* Plantilla de factura */}
      <div className="card space-y-5">
        <div>
          <h2 className="font-bold text-white">🧾 Plantilla de factura</h2>
          <p className="text-xs text-gray-500 mt-1">Personaliza el aspecto y los textos que aparecerán en tus facturas PDF.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Estilo de plantilla</label>
            <select className="input" value={form.factura_config?.plantilla||'moderna'}
              onChange={e => setForm({...form, factura_config:{...(form.factura_config||{}), plantilla:e.target.value}})}>
              {PLANTILLAS.map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.desc}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Color principal</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {COLORES.map(c => (
                <button key={c.id} type="button" title={c.nombre}
                  onClick={() => setForm({...form, factura_config:{...(form.factura_config||{}), colorId:c.id}})}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all
                    ${form.factura_config?.colorId===c.id ? 'border-white/40 bg-white/10 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{background:c.hex}} />
                  {c.nombre}
                  {form.factura_config?.colorId===c.id && <span>✓</span>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Texto de pie de página</label>
            <input className="input" placeholder="Ej: Gracias por su confianza en Trofeos AKA"
              value={form.factura_config?.textoPie||''}
              onChange={e => setForm({...form, factura_config:{...(form.factura_config||{}), textoPie:e.target.value}})} />
          </div>
          <div>
            <label className="label">Forma de pago por defecto</label>
            <input className="input" placeholder="Ej: Transferencia bancaria. IBAN: ES00 0000 0000 00"
              value={form.factura_config?.formaPago||''}
              onChange={e => setForm({...form, factura_config:{...(form.factura_config||{}), formaPago:e.target.value}})} />
            <p className="text-xs text-gray-600 mt-1">Aparecerá al pie de todas las facturas PDF</p>
          </div>
          <div className="md:col-span-2">
            <label className="label">Notas / condiciones por defecto</label>
            <textarea className="input h-20 resize-none text-sm"
              placeholder="Ej: El pago deberá realizarse en un plazo de 30 días desde la fecha de emisión..."
              value={form.factura_config?.notas||''}
              onChange={e => setForm({...form, factura_config:{...(form.factura_config||{}), notas:e.target.value}})} />
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Vista previa</div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-12 rounded-full flex-shrink-0"
              style={{background: COLORES.find(c=>c.id===(form.factura_config?.colorId||'azul'))?.hex || '#1D4ED8'}} />
            <div>
              <div className="font-bold text-white">{PLANTILLAS.find(p=>p.id===(form.factura_config?.plantilla||'moderna'))?.nombre}</div>
              <div className="text-xs text-gray-400 mt-0.5">{COLORES.find(c=>c.id===(form.factura_config?.colorId||'azul'))?.nombre} · {form.serie||'FAC'}-0001</div>
              {form.factura_config?.formaPago && <div className="text-xs text-gray-600 mt-1 italic">{form.factura_config.formaPago}</div>}
              {form.factura_config?.textoPie && <div className="text-xs text-gray-600 italic">{form.factura_config.textoPie}</div>}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-600">También puedes cambiar plantilla y color al descargar cada factura individualmente.</p>
      </div>

      {/* Plantilla de presupuesto */}
      <div className="card space-y-5">
        <div>
          <h2 className="font-bold text-white">📋 Plantilla de presupuesto</h2>
          <p className="text-xs text-gray-500 mt-1">Personaliza el aspecto y los textos que aparecerán en todos tus presupuestos PDF.</p>
        </div>

        {/* Diseño */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Estilo de plantilla</label>
            <select className="input" value={form.presupuesto_config?.plantilla||'moderna'}
              onChange={e => setForm({...form, presupuesto_config:{...(form.presupuesto_config||{}), plantilla:e.target.value}})}>
              <option value="moderna">Moderna — Cabecera con color</option>
              <option value="clasica">Clásica — Líneas profesionales</option>
              <option value="minimalista">Minimalista — Elegante y limpia</option>
            </select>
          </div>
          <div>
            <label className="label">Color principal</label>
            <div className="flex items-center gap-3">
              <input type="color" className="h-10 w-16 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer"
                value={form.presupuesto_config?.color||'#00C9A7'}
                onChange={e => setForm({...form, presupuesto_config:{...(form.presupuesto_config||{}), color:e.target.value}})} />
              <div className="flex gap-2 flex-wrap">
                {['#00C9A7','#1D4ED8','#059669','#DC2626','#7C3AED','#D97706','#111827'].map(c => (
                  <button key={c} type="button" title={c}
                    onClick={() => setForm({...form, presupuesto_config:{...(form.presupuesto_config||{}), color:c}})}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${form.presupuesto_config?.color===c ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{background:c}} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Textos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Título del documento</label>
            <input className="input" placeholder="PRESUPUESTO" {...pc('titulo')} />
            <p className="text-xs text-gray-600 mt-1">Ej: PRESUPUESTO, OFERTA, PROPUESTA</p>
          </div>
          <div>
            <label className="label">Texto de pie de página</label>
            <input className="input" placeholder="¡Gracias por confiar en nosotros!" {...pc('textoPie')} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Texto de validez</label>
            <input className="input" placeholder="Este presupuesto tiene una validez de 30 días." {...pc('textoValidez')} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Condiciones por defecto</label>
            <textarea className="input h-28 resize-none text-sm"
              placeholder="Ej: Forma de pago: 50% a la confirmación y 50% a la entrega. Los precios no incluyen gastos de envío..."
              value={form.presupuesto_config?.condiciones||''}
              onChange={e => setForm({...form, presupuesto_config:{...(form.presupuesto_config||{}), condiciones:e.target.value}})} />
            <p className="text-xs text-gray-600 mt-1">Estas condiciones aparecerán en todos los presupuestos. Puedes modificarlas individualmente al crear cada uno.</p>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Vista previa</div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-12 rounded-full flex-shrink-0" style={{background: form.presupuesto_config?.color||'#00C9A7'}} />
            <div>
              <div className="font-bold text-white">{form.presupuesto_config?.titulo||'PRESUPUESTO'}</div>
              <div className="text-xs text-gray-400 mt-0.5">{form.presupuesto_config?.plantilla||'moderna'} · {form.serie_presupuesto||'PRE'}-0001</div>
              <div className="text-xs text-gray-600 mt-1 italic">{form.presupuesto_config?.textoValidez||'Validez 30 días'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Info cuenta */}
      <div className="card space-y-2">
        <h2 className="font-bold text-white">Cuenta</h2>
        <div className="text-sm text-gray-400">
          <span className="text-gray-500">Email: </span>{session.user.email}
        </div>
        <div className="text-xs text-gray-600 mt-2">
          Datos almacenados de forma segura en Supabase · Cifrado en tránsito y reposo.
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm p-3 rounded-lg">
          ⚠️ {error}
        </div>
      )}
    </form>
  )
}

const Skeleton = () => (
  <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-40" />
    <div className="h-64 bg-gray-800 rounded-xl" />
    <div className="h-40 bg-gray-800 rounded-xl" />
  </div>
)
