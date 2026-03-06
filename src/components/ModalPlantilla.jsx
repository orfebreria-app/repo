import { useState } from 'react'
import { PLANTILLAS, COLORES, generarPDF } from '../lib/pdfGenerator'

export default function ModalPlantilla({ factura, empresa, onClose }) {
  const [plantilla, setPlantilla] = useState('moderna')
  const [colorId,   setColorId]   = useState('azul')
  const [generating, setGenerating] = useState(false)

  const color = COLORES.find(c => c.id === colorId)

  const handleDescargar = async () => {
    setGenerating(true)
    try {
      const conceptos = factura.conceptos_factura || []
      const doc = await generarPDF({
        factura,
        empresa,
        conceptos,
        plantilla,
        colorId,
        logoUrl: empresa?.logo_url || null,
      })
      doc.save(`${factura.folio}.pdf`)
    } catch (e) {
      console.error(e)
      alert('Error al generar el PDF. Inténtalo de nuevo.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-white">🎨 Diseño de factura</h3>
            <p className="text-xs text-gray-500 mt-0.5">Elige plantilla y color · {factura.folio}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">

          {/* Plantillas */}
          <div>
            <label className="label mb-3">Plantilla</label>
            <div className="grid grid-cols-3 gap-3">
              {PLANTILLAS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlantilla(p.id)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    plantilla === p.id
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
                  }`}
                >
                  {/* Mini preview */}
                  <MiniPreview tipo={p.id} color={color?.hex || '#1D4ED8'} />
                  <div className="mt-3">
                    <div className={`text-sm font-bold ${plantilla === p.id ? 'text-brand-500' : 'text-gray-200'}`}>
                      {p.nombre}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Colores */}
          <div>
            <label className="label mb-3">Color principal</label>
            <div className="flex flex-wrap gap-3">
              {COLORES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setColorId(c.id)}
                  title={c.nombre}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm ${
                    colorId === c.id
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ background: c.hex }}
                  />
                  {c.nombre}
                  {colorId === c.id && <span className="text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Logo info */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🖼️</span>
              <div>
                <div className="font-semibold text-gray-200 mb-1">Logo de empresa</div>
                {empresa?.logo_url ? (
                  <div className="flex items-center gap-3">
                    <img src={empresa.logo_url} alt="Logo" className="h-10 object-contain rounded" />
                    <span className="text-xs text-green-400">✓ Logo configurado — se incluirá en el PDF</span>
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs">
                    No tienes logo configurado. Puedes añadirlo en{' '}
                    <span className="text-brand-500">Configuración → Logo de empresa</span>.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Resumen */}
          <div className="bg-gray-800/30 rounded-xl p-4 text-sm">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Vista previa de selección</div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-10 rounded-full flex-shrink-0" style={{ background: color?.hex }} />
              <div>
                <div className="text-white font-semibold">{PLANTILLAS.find(p=>p.id===plantilla)?.nombre}</div>
                <div className="text-gray-400 text-xs">{color?.nombre} · {factura.folio} · {factura.clientes?.nombre}</div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button
            onClick={handleDescargar}
            disabled={generating}
            className="btn-primary flex items-center gap-2 px-5"
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                Generando...
              </>
            ) : (
              <>📥 Descargar PDF</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mini preview visual de cada plantilla ──────────────
function MiniPreview({ tipo, color }) {
  if (tipo === 'moderna') return (
    <div className="w-full h-20 bg-gray-950 rounded-lg overflow-hidden border border-gray-700">
      <div className="h-7 w-full rounded-t-lg" style={{ background: color }} />
      <div className="p-1.5 space-y-1">
        <div className="flex gap-1">
          <div className="h-1.5 rounded flex-1 bg-gray-700" />
          <div className="h-1.5 rounded w-8 bg-gray-700" />
        </div>
        <div className="h-1 rounded bg-gray-800 w-3/4" />
        <div className="h-1 rounded bg-gray-800 w-1/2" />
        <div className="flex justify-end mt-1">
          <div className="h-2.5 w-12 rounded" style={{ background: color + '44' }} />
        </div>
      </div>
    </div>
  )

  if (tipo === 'clasica') return (
    <div className="w-full h-20 bg-gray-950 rounded-lg overflow-hidden border border-gray-700 p-2 space-y-1.5">
      <div className="flex justify-between items-center">
        <div className="h-2 w-14 rounded bg-gray-600" />
        <div className="text-xs font-bold" style={{ color }}>FACTURA</div>
      </div>
      <div className="h-px w-full" style={{ background: color }} />
      <div className="space-y-0.5">
        <div className="h-1 rounded bg-gray-800 w-full" />
        <div className="h-1 rounded bg-gray-800 w-4/5" />
        <div className="h-1 rounded bg-gray-800 w-3/5" />
      </div>
      <div className="flex justify-end">
        <div className="h-2 w-10 rounded" style={{ background: color }} />
      </div>
    </div>
  )

  return (
    <div className="w-full h-20 bg-gray-950 rounded-lg overflow-hidden border border-gray-700 p-2">
      <div className="absolute left-0 top-0 w-0.5 h-full" style={{ background: color }} />
      <div className="space-y-1 mt-1 ml-1">
        <div className="text-xs font-black" style={{ color }}>FACTURA</div>
        <div className="h-px bg-gray-800 w-full" />
        <div className="space-y-0.5">
          <div className="h-1 rounded bg-gray-800 w-full" />
          <div className="h-1 rounded bg-gray-800 w-3/4" />
        </div>
        <div className="flex justify-end">
          <div className="h-1.5 w-8 rounded" style={{ background: color }} />
        </div>
      </div>
    </div>
  )
}
