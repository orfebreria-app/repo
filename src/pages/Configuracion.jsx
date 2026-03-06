import { useEffect, useState } from 'react'
import { getEmpresa, upsertEmpresa, supabase } from '../lib/supabase'

const empty = {
  nombre: '', nif_cif: '', email: '', telefono: '',
  direccion: '', ciudad: '', cp: '', pais: 'España',
  moneda: 'EUR', serie: 'FAC', iva_default: 21,
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
              <img src={form.logo_url} alt="Logo" className="h-20 max-w-[160px] object-contain rounded-lg border border-gray-700 bg-gray-800 p-2" />
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
