import { useEffect, useState } from 'react'
import { getEmpresa, getFacturasParaInforme, getComprasParaInforme, formatEuro } from '../lib/supabase'
import { agruparPorIva } from '../lib/calculos'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const TRIMESTRES = [
  { n: 1, label: '1T (ene-mar)', desde: (y) => `${y}-01-01`, hasta: (y) => `${y}-03-31` },
  { n: 2, label: '2T (abr-jun)', desde: (y) => `${y}-04-01`, hasta: (y) => `${y}-06-30` },
  { n: 3, label: '3T (jul-sep)', desde: (y) => `${y}-07-01`, hasta: (y) => `${y}-09-30` },
  { n: 4, label: '4T (oct-dic)', desde: (y) => `${y}-10-01`, hasta: (y) => `${y}-12-31` },
]

const trimestreActual = () => Math.floor(new Date().getMonth() / 3) + 1

const descargarBlob = (contenido, nombreArchivo, tipoMime) => {
  const blob = new Blob([contenido], { type: tipoMime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const csvEscape = (valor) => {
  const s = String(valor ?? '')
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export default function InformeIVA({ session }) {
  const [empresa, setEmpresa] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calculando, setCalculando] = useState(false)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [trimestre, setTrimestre] = useState(trimestreActual())
  const [ventas, setVentas] = useState(null)
  const [compras, setCompras] = useState(null)
  const [contadores, setContadores] = useState({ facturas: 0, compras: 0 })

  useEffect(() => {
    const init = async () => {
      const { data: emp } = await getEmpresa(session.user.id)
      setEmpresa(emp)
      setLoading(false)
    }
    init()
  }, [session])

  useEffect(() => {
    if (empresa) calcular()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, anio, trimestre])

  const calcular = async () => {
    setCalculando(true)
    const t = TRIMESTRES.find(t => t.n === trimestre)
    const desde = t.desde(anio)
    const hasta = t.hasta(anio)

    const [{ data: facturas }, { data: facturasCompra }] = await Promise.all([
      getFacturasParaInforme(empresa.id, desde, hasta),
      getComprasParaInforme(empresa.id, desde, hasta),
    ])

    const lineasVenta  = facturas.flatMap(f => f.conceptos_factura || [])
    const lineasCompra = facturasCompra.flatMap(f => f.lineas_factura_proveedor || [])

    setVentas(agruparPorIva(lineasVenta))
    setCompras(agruparPorIva(lineasCompra))
    setContadores({ facturas: facturas.length, compras: facturasCompra.length })
    setCalculando(false)
  }

  const sumar = (grupos, campo) => (grupos || []).reduce((s, g) => s + g[campo], 0)

  const baseVentas   = sumar(ventas, 'base')
  const cuotaVentas   = sumar(ventas, 'cuota')
  const recargoVentas = sumar(ventas, 'recargo')
  const baseCompras  = sumar(compras, 'base')
  const cuotaCompras  = sumar(compras, 'cuota')

  const resultado = +(cuotaVentas - cuotaCompras).toFixed(2)

  const trimestreInfo = TRIMESTRES.find(t => t.n === trimestre)
  const nombreBase = `informe-iva-${anio}-T${trimestre}`

  const exportarCSV = () => {
    const filas = []
    filas.push(['Informe de IVA', `${trimestreInfo.label} ${anio}`])
    filas.push([])
    filas.push(['VENTAS EMITIDAS (IVA REPERCUTIDO)'])
    filas.push(['Tipo IVA', 'Base', 'Cuota', 'Recargo'])
    ;(ventas || []).forEach(g => filas.push([`${g.tasa}%`, g.base.toFixed(2), g.cuota.toFixed(2), (g.recargo || 0).toFixed(2)]))
    filas.push([])
    filas.push(['COMPRAS A PROVEEDORES (IVA SOPORTADO)'])
    filas.push(['Tipo IVA', 'Base', 'Cuota', 'Recargo'])
    ;(compras || []).forEach(g => filas.push([`${g.tasa}%`, g.base.toFixed(2), g.cuota.toFixed(2), (g.recargo || 0).toFixed(2)]))
    filas.push([])
    filas.push(['RESUMEN DEL PERIODO'])
    filas.push(['Base imponible ventas', baseVentas.toFixed(2)])
    filas.push(['IVA repercutido (ventas)', cuotaVentas.toFixed(2)])
    if (recargoVentas > 0) filas.push(['Recargo de equivalencia cobrado', recargoVentas.toFixed(2)])
    filas.push(['Base imponible compras', baseCompras.toFixed(2)])
    filas.push(['IVA soportado (compras)', cuotaCompras.toFixed(2)])
    filas.push([resultado >= 0 ? 'Resultado (a ingresar, estimado)' : 'Resultado (a compensar, estimado)', Math.abs(resultado).toFixed(2)])

    const csv = '\uFEFF' + filas.map(fila => fila.map(csvEscape).join(';')).join('\r\n')
    descargarBlob(csv, `${nombreBase}.csv`, 'text/csv;charset=utf-8;')
  }

  const exportarPDF = () => {
    const doc = new jsPDF()
    let y = 18

    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('Informe de IVA', 14, y)
    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')
    y += 7
    doc.text(`${empresa?.nombre || ''} · ${trimestreInfo.label} ${anio}`, 14, y)
    y += 10

    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text(`Ventas emitidas (IVA repercutido) · ${contadores.facturas} factura${contadores.facturas !== 1 ? 's' : ''}`, 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Tipo IVA', 'Base', 'Cuota', 'Recargo']],
      body: (ventas && ventas.length)
        ? ventas.map(g => [`${g.tasa}%`, formatEuro(g.base), formatEuro(g.cuota), g.recargo > 0 ? formatEuro(g.recargo) : '—'])
        : [['Sin datos en este periodo.', '', '', '']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 10

    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text(`Compras a proveedores (IVA soportado) · ${contadores.compras} factura${contadores.compras !== 1 ? 's' : ''}`, 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Tipo IVA', 'Base', 'Cuota', 'Recargo']],
      body: (compras && compras.length)
        ? compras.map(g => [`${g.tasa}%`, formatEuro(g.base), formatEuro(g.cuota), g.recargo > 0 ? formatEuro(g.recargo) : '—'])
        : [['Sin datos en este periodo.', '', '', '']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 10

    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text('Resumen del periodo', 14, y)
    y += 6
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')

    const filasResumen = [
      ['Base imponible ventas', formatEuro(baseVentas)],
      ['IVA repercutido (ventas)', formatEuro(cuotaVentas)],
    ]
    if (recargoVentas > 0) filasResumen.push(['Recargo de equivalencia cobrado', formatEuro(recargoVentas)])
    filasResumen.push(['Base imponible compras', formatEuro(baseCompras)])
    filasResumen.push(['IVA soportado (compras)', formatEuro(cuotaCompras)])

    autoTable(doc, {
      startY: y,
      body: filasResumen,
      styles: { fontSize: 10 },
      margin: { left: 14, right: 14 },
      theme: 'plain',
    })
    y = doc.lastAutoTable.finalY + 4

    doc.setFont(undefined, 'bold')
    doc.setFontSize(11)
    doc.text(
      `${resultado >= 0 ? 'Resultado (a ingresar, estimado)' : 'Resultado (a compensar, estimado)'}: ${formatEuro(Math.abs(resultado))}`,
      14, y
    )
    y += 10

    doc.setFont(undefined, 'normal')
    doc.setFontSize(8)
    const aviso = 'Este resumen es orientativo, calculado directamente a partir de tus facturas y compras registradas. No sustituye el calculo de tu asesoria. Revisa esto con tu gestoria antes de presentar cualquier modelo.'
    const lineasAviso = doc.splitTextToSize(aviso, 180)
    doc.text(lineasAviso, 14, y)

    doc.save(`${nombreBase}.pdf`)
  }

  if (loading) return <Skeleton />

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Informe de IVA</h1>
        {!calculando && (
          <div className="flex gap-2">
            <button onClick={exportarCSV} className="btn-secondary text-sm flex items-center gap-2">
              📊 Exportar Excel
            </button>
            <button onClick={exportarPDF} className="btn-secondary text-sm flex items-center gap-2">
              📄 Exportar PDF
            </button>
          </div>
        )}
      </div>

      <div className="card flex items-center gap-4 flex-wrap">
        <div>
          <label className="label">Año</label>
          <input className="input w-28" type="number" value={anio} onChange={e => setAnio(Number(e.target.value))} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {TRIMESTRES.map(t => (
            <button
              key={t.n}
              onClick={() => setTrimestre(t.n)}
              className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${trimestre === t.n ? 'bg-brand-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {calculando ? (
        <div className="card text-center text-gray-500 text-sm py-10">Calculando...</div>
      ) : (
        <>
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Ventas emitidas (IVA repercutido) · {contadores.facturas} factura{contadores.facturas !== 1 && 's'}
            </h2>
            <TablaIva grupos={ventas} />
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Compras a proveedores (IVA soportado) · {contadores.compras} factura{contadores.compras !== 1 && 's'}
            </h2>
            <TablaIva grupos={compras} />
          </div>

          <div className="card space-y-2">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Resumen del periodo</h2>
            <Fila label="Base imponible ventas" valor={formatEuro(baseVentas)} />
            <Fila label="IVA repercutido (ventas)" valor={formatEuro(cuotaVentas)} />
            {recargoVentas > 0 && <Fila label="Recargo de equivalencia cobrado" valor={formatEuro(recargoVentas)} />}
            <Fila label="Base imponible compras" valor={formatEuro(baseCompras)} />
            <Fila label="IVA soportado (compras)" valor={formatEuro(cuotaCompras)} />
            <div className="border-t border-gray-800 my-2" />
            <Fila
              label={resultado >= 0 ? 'Resultado (a ingresar, estimado)' : 'Resultado (a compensar, estimado)'}
              valor={formatEuro(Math.abs(resultado))}
              destacado
            />
          </div>

          <p className="text-xs text-gray-600">
            Este resumen es orientativo, calculado directamente a partir de tus facturas y compras registradas.
            No sustituye el cálculo de tu asesoría — en particular, si estás en régimen de recargo de equivalencia,
            normalmente no presentas declaración trimestral de IVA de la forma habitual. Revisa esto con tu gestoría
            antes de presentar cualquier modelo.
          </p>
        </>
      )}
    </div>
  )
}

const TablaIva = ({ grupos }) => {
  if (!grupos || !grupos.length) return <p className="text-sm text-gray-600">Sin datos en este periodo.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-800">
          <th className="text-left py-2 text-xs text-gray-500 font-semibold uppercase tracking-wide">Tipo IVA</th>
          <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase tracking-wide">Base</th>
          <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase tracking-wide">Cuota</th>
          <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase tracking-wide">Recargo</th>
        </tr>
      </thead>
      <tbody>
        {grupos.map(g => (
          <tr key={g.tasa} className="border-b border-gray-800/50">
            <td className="py-2 text-gray-300">{g.tasa}%</td>
            <td className="py-2 text-right font-mono text-gray-300">{formatEuro(g.base)}</td>
            <td className="py-2 text-right font-mono text-gray-300">{formatEuro(g.cuota)}</td>
            <td className="py-2 text-right font-mono text-gray-500">{g.recargo > 0 ? formatEuro(g.recargo) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const Fila = ({ label, valor, destacado }) => (
  <div className={`flex justify-between items-center ${destacado ? 'text-base font-bold text-white pt-1' : 'text-sm text-gray-400'}`}>
    <span>{label}</span>
    <span className="font-mono">{valor}</span>
  </div>
)

const Skeleton = () => (
  <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
    <div className="h-8 bg-gray-800 rounded w-48" />
    <div className="h-16 bg-gray-800 rounded-xl" />
    <div className="h-40 bg-gray-800 rounded-xl" />
  </div>
)
