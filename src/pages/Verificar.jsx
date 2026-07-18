import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { verificarFactura, formatEuro, formatFecha } from '../lib/supabase'

export default function Verificar() {
  const [params] = useSearchParams()
  const [estado, setEstado] = useState('cargando') // cargando | valido | invalido | error | sin_datos
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    const folio = params.get('folio')
    const nif   = params.get('nif')
    const total = params.get('total')
    const fecha = params.get('fecha')

    if (!folio || !nif || !total || !fecha) {
      setEstado('sin_datos')
      return
    }

    verificarFactura({ folio, nif, total: Number(total), fecha }).then(({ data, error }) => {
      if (error) { console.error(error); setEstado('error'); return }
      if (!data)  { setEstado('invalido'); return }
      setResultado(data)
      setEstado('valido')
    })
  }, [params])

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0f0e0c' }}>
      <div className="w-full max-w-sm card text-center">
        <div className="text-3xl mb-3">
          {estado === 'cargando'  && '⏳'}
          {estado === 'valido'    && '✅'}
          {estado === 'invalido'  && '❌'}
          {estado === 'error'     && '⚠️'}
          {estado === 'sin_datos' && '⚠️'}
        </div>

        {estado === 'cargando' && <p className="text-gray-400 text-sm">Verificando factura…</p>}

        {estado === 'valido' && resultado && (
          <>
            <h1 className="text-lg font-bold text-white mb-1">Factura verificada</h1>
            <p className="text-xs text-gray-500 mb-4">Emitida por {resultado.empresa_nombre}</p>
            <div className="text-left text-sm space-y-2 bg-gray-800/50 rounded-lg p-4">
              <div className="flex justify-between"><span className="text-gray-500">Folio</span><span className="text-gray-100 font-mono">{resultado.folio}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Fecha</span><span className="text-gray-100">{formatFecha(resultado.fecha_emision)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="text-gray-100">{formatEuro(resultado.total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Estado</span><span className="text-gray-100 capitalize">{resultado.estado}</span></div>
            </div>
          </>
        )}

        {estado === 'invalido' && (
          <>
            <h1 className="text-lg font-bold text-white mb-1">No se ha podido verificar</h1>
            <p className="text-sm text-gray-500">No encontramos ninguna factura que coincida con estos datos. Si crees que es un error, contacta directamente con quien te emitió la factura.</p>
          </>
        )}

        {estado === 'error' && (
          <>
            <h1 className="text-lg font-bold text-white mb-1">No se pudo comprobar</h1>
            <p className="text-sm text-gray-500">Hubo un problema al consultar la factura. Si esto persiste, es posible que falte ejecutar la configuración de verificación en la base de datos.</p>
          </>
        )}

        {estado === 'sin_datos' && (
          <>
            <h1 className="text-lg font-bold text-white mb-1">Enlace incompleto</h1>
            <p className="text-sm text-gray-500">Este enlace no contiene los datos necesarios para verificar la factura.</p>
          </>
        )}
      </div>
    </div>
  )
}
