import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmpresa, getFacturas, getFactura, updateEstadoFactura, deleteFactura, formatEuro, formatFecha } from '../lib/supabase'
import ModalPlantilla from '../components/ModalPlantilla'

const ESTADOS = ['todos','borrador','emitida','pagada','vencida','cancelada']

const badge = (e) => ({
  pagada:    'badge-pagada',
  emitida:   'badge-emitida',
  borrador:  'badge-borrador',
  vencida:   'badge-vencida',
  cancelada: 'badge-cancelada',
}[e] || 'badge-borrador')

export default function Facturas({ session }) {
  const [empresa, setEmpresa]   = useState(null)
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filtro, setFiltro]     = useState('todos')
  const [buscar, setBuscar]     = useState('')
  const [pdfFactura, setPdfFactura] = useState(null)

  const cargar = async (emp) => {
    const { data } = await getFacturas(emp.id)
    setFacturas(data)
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

  const handleEstado = async (id, estado) => {
    await updateEstadoFactura(id, estado)
    await cargar(empresa)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta factura?')) return
    await deleteFactura(id)
    await cargar(empresa)
  }

  const handlePDF = async (id) => {
    const { data } = await getFactura(id)
    if (data) setPdfFactura(data)
  }

  const filtradas = facturas
    .filter(f => filtro === 'todos' || f.estado === filtro)
    .filter(f =>
      f.folio.toLowerCase().includes(buscar.toLowerCase()) ||
      (f.clientes?.nombre || '').toLowerCase().includes(buscar.toLowerCase())
    )

  if (loading) return <Skeleton />

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Facturas</h1>
        <Link to="/facturas/nueva" className="btn-primary flex items-center gap-2">
          <span>+</span> Nueva Factura
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {ESTADOS.map(e => (
          <button
            key={e}
            onClick={() => setFiltro(e)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize
              ${filtro === e
                ? 'bg-brand-500 text-gray-950'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'}`}
          >
            {e === 'todos' ? 'Todas' : e}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <input
        className="input max-w-sm"
        placeholder="🔍  Buscar por folio o cliente..."
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
      />

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">🧾</div>
            <p className="text-sm">{buscar || filtro !== 'todos' ? 'Sin resultados' : 'Aún no hay facturas.'}</p>
            {!buscar && filtro === 'todos' && (
              <Link to="/facturas/nueva" className="text-brand-500 text-sm hover:underline mt-1 inline-block">
                Crear primera factura
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <Th>Folio</Th>
                <Th>Cliente</Th>
                <Th>Fecha</Th>
                <Th>Vencimiento</Th>
                <Th right>Total</Th>
                <Th center>Estado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map(f => (
                <tr key={f.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-gray-300">{f.folio}</td>
                  <td className="py-3 px-4 text-white font-medium">{f.clientes?.nombre || '—'}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{formatFecha(f.fecha_emision)}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{formatFecha(f.fecha_vencimiento)}</td>
                  <td className="py-3 px-4 text-right font-bold text-white">{formatEuro(f.total)}</td>
                  <td className="py-3 px-4 text-center">
                    <select
                      value={f.estado}
                      onChange={e => handleEstado(f.id, e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border bg-transparent cursor-pointer ${badge(f.estado)}`}
                    >
                      {['borrador','emitida','pagada','vencida','cancelada'].map(s => (
                        <option key={s} value={s} className="bg-gray-900 text-gray-200">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => handlePDF(f.id)}
                        className="text-xs text-gray-500 hover:text-brand-500 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                        title="Descargar PDF"
                      >
                        📥 PDF
                      </button>
                      <button
                        onClick={() => handleDelete(f.id)}
                        className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Totales */}
      {filtradas.length > 0 && (
        <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
          <span>{filtradas.length} factura{filtradas.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>Total: <strong className="text-white">{formatEuro(filtradas.reduce((s,f) => s + Number(f.total), 0))}</strong></span>
        </div>
      )}

      {pdfFactura && (
        <ModalPlantilla
          factura={pdfFactura}
          empresa={empresa}
          onClose={() => setPdfFactura(null)}
        />
      )}
    </div>
  )
}

const Th = ({ children, right, center }) => (
  <th className={`py-3 px-4 text-xs text-gray-500 font-semibold uppercase tracking-wide ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>
    {children}
  </th>
)

const Skeleton = () => (
  <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-32" />
    <div className="flex gap-2">{[...Array(5)].map((_,i) => <div key={i} className="h-7 w-20 bg-gray-800 rounded-full" />)}</div>
    <div className="h-64 bg-gray-800 rounded-xl" />
  </div>
)
