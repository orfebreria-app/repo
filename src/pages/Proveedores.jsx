import { useState } from 'react'

const empty = { nombre:'', nif_cif:'', email:'', telefono:'', direccion:'', ciudad:'', cp:'' }

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([])
  const [form, setForm] = useState(empty)
  const [modal, setModal] = useState(false)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')

  // Exportar proveedores a CSV
  const exportCSV = () => {
    const headers = ['Nombre','NIF/CIF','Email','Teléfono','Dirección','Ciudad','CP']
    const rows = proveedores.map(p => [
      p.nombre,
      p.nif_cif,
      p.email,
      p.telefono,
      p.direccion,
      p.ciudad,
      p.cp
    ])
    const csv = [headers, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'proveedores.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Importar proveedores desde CSV
  const importCSV = e => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      const lines = text.split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) return
      const [header, ...rows] = lines
      const cols = header.split(',').map(h => h.replace(/"/g,''))
      const newProveedores = rows.map(row => {
        const vals = row.match(/("[^"]*"|[^,]+)/g).map(v => v.replace(/"/g,''))
        const obj = { id: Date.now() + Math.random() }
        cols.forEach((c,i) => { obj[c.toLowerCase()] = vals[i] })
        return obj
      })
      setProveedores(p => [...p, ...newProveedores])
    }
    reader.readAsText(file)
  }

  const openNew  = () => { setForm(empty); setError(''); setModal(true) }
  const closeModal = () => setModal(false)

  const handleSave = e => {
    e.preventDefault()
    if (!form.nombre.trim()) return setError('El nombre es obligatorio')
    setProveedores(p => [...p, { ...form, id: Date.now() }])
    setModal(false)
    setForm(empty)
    setError('')
  }

  const handleDelete = id => {
    if (!confirm('¿Eliminar este proveedor?')) return
    setProveedores(p => p.filter(x => x.id !== id))
  }

  const filtrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(buscar.toLowerCase()) ||
    (p.nif_cif || '').toLowerCase().includes(buscar.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Proveedores</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCSV} type="button">Exportar CSV</button>
          <label className="btn-secondary cursor-pointer">
            Importar CSV
            <input type="file" accept=".csv" style={{display:'none'}} onChange={importCSV} />
          </label>
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <span>+</span> Nuevo proveedor
          </button>
        </div>
      </div>
      <input
        className="input max-w-sm"
        placeholder="🔍  Buscar por nombre, email o NIF..."
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
      />
      <div className="card p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-sm">{buscar ? 'Sin resultados' : 'Aún no hay proveedores.'}</p>
            {!buscar && (
              <button onClick={openNew} className="text-brand-500 text-sm hover:underline mt-1">
                Añadir primer proveedor
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th>Nombre</th>
                <th>NIF/CIF</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Dirección</th>
                <th>Ciudad</th>
                <th>CP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-white">{p.nombre}</td>
                  <td className="py-3 px-4 text-gray-400 font-mono text-xs">{p.nif_cif || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{p.email || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{p.telefono || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{p.direccion || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{p.ciudad || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{p.cp || '—'}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* Modal para nuevo proveedor */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <form onSubmit={handleSave} className="card p-6 space-y-4 w-full max-w-md">
            <h2 className="font-bold text-lg text-white mb-2">Nuevo proveedor</h2>
            <div>
              <label className="label">Nombre *</label>
              <input className="input" value={form.nombre} onChange={e => setForm(f => ({...f, nombre: e.target.value}))} required />
            </div>
            <div>
              <label className="label">NIF/CIF</label>
              <input className="input" value={form.nif_cif} onChange={e => setForm(f => ({...f, nif_cif: e.target.value}))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={form.telefono} onChange={e => setForm(f => ({...f, telefono: e.target.value}))} />
            </div>
            <div>
              <label className="label">Dirección</label>
              <input className="input" value={form.direccion} onChange={e => setForm(f => ({...f, direccion: e.target.value}))} />
            </div>
            <div>
              <label className="label">Ciudad</label>
              <input className="input" value={form.ciudad} onChange={e => setForm(f => ({...f, ciudad: e.target.value}))} />
            </div>
            <div>
              <label className="label">Código postal</label>
              <input className="input" value={form.cp} onChange={e => setForm(f => ({...f, cp: e.target.value}))} />
            </div>
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
              <button type="submit" className="btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
