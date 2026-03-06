import { useEffect, useState } from 'react'
import { getEmpresa, getClientes, upsertCliente, deleteCliente } from '../lib/supabase'

const empty = { nombre:'', nif_cif:'', email:'', telefono:'', direccion:'', ciudad:'', cp:'' }

export default function Clientes({ session }) {
  const [empresa, setEmpresa]   = useState(null)
  const [clientes, setClientes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(empty)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [buscar, setBuscar]     = useState('')

  const cargar = async (emp) => {
    const { data } = await getClientes(emp.id)
    setClientes(data)
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

  const openNew  = () => { setForm(empty); setError(''); setModal(true) }
  const openEdit = (c) => { setForm(c); setError(''); setModal(true) }
  const closeModal = () => setModal(false)

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return setError('El nombre es obligatorio')
    setSaving(true)
    const payload = { ...form, empresa_id: empresa.id }
    const { error: err } = await upsertCliente(payload)
    if (err) { setError(err.message); setSaving(false); return }
    await cargar(empresa)
    setSaving(false)
    closeModal()
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este cliente?')) return
    await deleteCliente(id)
    await cargar(empresa)
  }

  const filtrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(buscar.toLowerCase()) ||
    (c.nif_cif || '').toLowerCase().includes(buscar.toLowerCase())
  )

  if (loading) return <Skeleton />

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Clientes</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <span>+</span> Nuevo cliente
        </button>
      </div>

      {/* Buscador */}
      <input
        className="input max-w-sm"
        placeholder="🔍  Buscar por nombre, email o NIF..."
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
      />

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-sm">{buscar ? 'Sin resultados' : 'Aún no hay clientes.'}</p>
            {!buscar && (
              <button onClick={openNew} className="text-brand-500 text-sm hover:underline mt-1">
                Añadir primer cliente
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <Th>Nombre</Th>
                <Th>NIF/CIF</Th>
                <Th>Email</Th>
                <Th>Teléfono</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(c => (
                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-white">{c.nombre}</td>
                  <td className="py-3 px-4 text-gray-400 font-mono text-xs">{c.nif_cif || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{c.email || '—'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{c.telefono || '—'}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(c)} className="text-xs text-gray-500 hover:text-brand-500 transition-colors px-2 py-1 rounded hover:bg-gray-800">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800">
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

      {/* Modal */}
      {modal && (
        <Modal title={form.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={closeModal}>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Nombre / Razón social *</label>
                <input className="input" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
              </div>
              <div>
                <label className="label">NIF / CIF</label>
                <input className="input" value={form.nif_cif || ''} onChange={e => setForm({...form, nif_cif: e.target.value})} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
              <div>
                <label className="label">Teléfono</label>
                <input className="input" value={form.telefono || ''} onChange={e => setForm({...form, telefono: e.target.value})} />
              </div>
              <div>
                <label className="label">Ciudad</label>
                <input className="input" value={form.ciudad || ''} onChange={e => setForm({...form, ciudad: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="label">Dirección</label>
                <input className="input" value={form.direccion || ''} onChange={e => setForm({...form, direccion: e.target.value})} />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

const Th = ({ children }) => (
  <th className="text-left py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide">{children}</th>
)

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const Skeleton = () => (
  <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-32" />
    <div className="h-10 bg-gray-800 rounded w-64" />
    <div className="h-48 bg-gray-800 rounded-xl" />
  </div>
)
