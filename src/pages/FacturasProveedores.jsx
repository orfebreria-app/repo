import { useState } from 'react'

const initialForm = {
  proveedor: '',
  fecha: '',
  importe: '',
  concepto: '',
  notas: '',
  adjunto: null,
}

export default function FacturasProveedores() {
  const [form, setForm] = useState(initialForm)
  const [facturas, setFacturas] = useState([])
  const [error, setError] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [proveedorFiltro, setProveedorFiltro] = useState('')

  const handleChange = e => {
    const { name, value, files } = e.target
    setForm(f => ({
      ...f,
      [name]: files ? files[0] : value
    }))
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (!form.proveedor || !form.fecha || !form.importe) {
      setError('Proveedor, fecha e importe son obligatorios')
      return
    }
    setFacturas(f => [...f, { ...form, id: Date.now() }])
    setForm(initialForm)
    setError('')
  }

  // Exportar facturas a CSV
  const exportCSV = () => {
    const headers = ['Proveedor','Fecha','Importe','Concepto','Notas','Adjunto']
    const rows = facturas.map(f => [
      f.proveedor,
      f.fecha,
      f.importe,
      f.concepto,
      f.notas,
      f.adjunto ? f.adjunto.name : ''
    ])
    const csv = [headers, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'facturas_proveedores.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Importar facturas desde CSV
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
      const newFacturas = rows.map(row => {
        const vals = row.match(/("[^"]*"|[^,]+)/g).map(v => v.replace(/"/g,''))
        const obj = { id: Date.now() + Math.random() }
        cols.forEach((c,i) => { obj[c.toLowerCase()] = vals[i] })
        return obj
      })
      setFacturas(f => [...f, ...newFacturas])
    }
    reader.readAsText(file)
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
        <h1 className="text-2xl font-bold text-white">Registro de facturas de proveedores</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCSV} type="button">Exportar CSV</button>
          <label className="btn-secondary cursor-pointer">
            Importar CSV
            <input type="file" accept=".csv" style={{display:'none'}} onChange={importCSV} />
          </label>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-4 flex flex-col md:flex-row gap-4">
        <div>
          <label className="label">Filtrar por tipo de gasto</label>
          <select className="input" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="luz">Luz</option>
            <option value="agua">Agua</option>
            <option value="telefono">Teléfono</option>
            <option value="internet">Internet</option>
            <option value="alquiler">Alquiler</option>
            <option value="productos">Productos</option>
            <option value="otros">Otros</option>
          </select>
        </div>
        <div>
          <label className="label">Filtrar por proveedor</label>
          <input className="input" type="text" placeholder="Nombre proveedor" value={proveedorFiltro} onChange={e => setProveedorFiltro(e.target.value)} />
        </div>
      </div>
      <form onSubmit={handleSubmit} className="card space-y-4 p-4">
        <div>
          <label className="label">Proveedor *</label>
          <input className="input" name="proveedor" value={form.proveedor} onChange={handleChange} required />
        </div>
        <div>
          <label className="label">Fecha *</label>
          <input className="input" type="date" name="fecha" value={form.fecha} onChange={handleChange} required />
        </div>
        <div>
          <label className="label">Importe *</label>
          <input className="input" type="number" step="0.01" name="importe" value={form.importe} onChange={handleChange} required />
        </div>
        <div>
          <label className="label">Concepto</label>
          <input className="input" name="concepto" value={form.concepto} onChange={handleChange} />
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="input" name="notas" value={form.notas} onChange={handleChange} />
        </div>
        <div>
          <label className="label">Adjuntar factura (opcional)</label>
          <input className="input" type="file" name="adjunto" accept="application/pdf,image/*" onChange={handleChange} />
        </div>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <button type="submit" className="btn-primary">Registrar factura</button>
      </form>

      <div className="card p-4 mt-8">
        <h2 className="font-bold text-lg text-white mb-2">Facturas registradas</h2>
        {facturas.length === 0 ? (
          <p className="text-gray-400">No hay facturas registradas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500">
                <th>Proveedor</th>
                <th>Fecha</th>
                <th>Importe</th>
                <th>Concepto</th>
                <th>Notas</th>
                <th>Adjunto</th>
              </tr>
            </thead>
            <tbody>
              {facturas
                .filter(f => {
                  // Filtro por tipo de gasto (concepto)
                  if (tipoFiltro && (!f.concepto || f.concepto.toLowerCase() !== tipoFiltro)) return false
                  // Filtro por proveedor
                  if (proveedorFiltro && !f.proveedor.toLowerCase().includes(proveedorFiltro.toLowerCase())) return false
                  return true
                })
                .map(f => (
                  <tr key={f.id} className="border-t border-gray-800">
                    <td>{f.proveedor}</td>
                    <td>{f.fecha}</td>
                    <td>{Number(f.importe).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                    <td>{f.concepto}</td>
                    <td>{f.notas}</td>
                    <td>{f.adjunto ? f.adjunto.name : '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
