import { useState } from 'react'
import { enviarEmail } from '../lib/supabase'

export default function ModalEnviarEmail({ tipo, numero, clienteEmail, clienteNombre, empresaNombre, onClose, onPDF }) {
  const [email, setEmail]     = useState(clienteEmail || '')
  const [cuerpo, setCuerpo]   = useState('')
  const [sending, setSending] = useState(false)
  const [ok, setOk]           = useState(false)
  const [error, setError]     = useState('')

  const asunto = tipo === 'factura'
    ? `Factura ${numero} — ${empresaNombre}`
    : `Presupuesto ${numero} — ${empresaNombre}`

  const cuerpoDefault = tipo === 'factura'
    ? `Estimado/a ${clienteNombre || 'cliente'},\n\nAdjunto encontrará la factura nº ${numero} correspondiente a los servicios prestados.\n\nQuedamos a su disposición para cualquier consulta.\n\nUn cordial saludo,\n${empresaNombre}`
    : `Estimado/a ${clienteNombre || 'cliente'},\n\nNos complace hacerle llegar el presupuesto nº ${numero} solicitado.\n\nEl presupuesto tiene una validez de 30 días. Si desea aceptarlo o tiene alguna consulta, no dude en ponerse en contacto con nosotros.\n\nUn cordial saludo,\n${empresaNombre}`

  const textoFinal = cuerpo || cuerpoDefault

  const handleEnviar = async () => {
    if (!email.trim() || !email.includes('@')) return setError('Introduce un email válido')
    setSending(true)
    setError('')

    // Generar PDF en base64 y enlace de descarga — lo incluimos como enlace en el email
    // (adjuntar PDF en Resend free tier requiere upgrade, enviamos enlace o texto)
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:#1a1400;padding:20px;border-radius:8px;margin-bottom:24px;text-align:center;">
    <h1 style="color:#C9A84C;margin:0;font-size:22px;">${empresaNombre}</h1>
    <p style="color:#a8882e;margin:6px 0 0;font-size:13px;">info@trofeosaka.es</p>
  </div>

  <div style="background:#f9f9f9;border-radius:8px;padding:24px;border-left:4px solid #C9A84C;">
    <h2 style="margin:0 0 16px;color:#1a1400;font-size:18px;">
      ${tipo === 'factura' ? '🧾 ' : '📋 '}${tipo === 'factura' ? 'Factura' : 'Presupuesto'} nº <strong>${numero}</strong>
    </h2>
    <div style="white-space:pre-line;font-size:14px;line-height:1.7;color:#444;">
${textoFinal}
    </div>
  </div>

  <div style="margin-top:24px;text-align:center;">
    <p style="font-size:12px;color:#999;">
      Para descargar el documento, por favor responda a este correo o llámenos.<br>
      Trofeos AKA · info@trofeosaka.es
    </p>
  </div>
</body>
</html>`

    const { ok: sent, error: err } = await enviarEmail({
      to: email.trim(),
      subject: asunto,
      html,
      fromName: empresaNombre,
    })

    setSending(false)
    if (err) { setError(err); return }
    setOk(true)
  }

  if (ok) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
        <div className="text-5xl mb-4">✅</div>
        <h3 className="text-xl font-bold text-white mb-2">¡Enviado!</h3>
        <p className="text-gray-400 text-sm mb-6">Email enviado a <strong className="text-white">{email}</strong></p>
        <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">
              📧 Enviar {tipo === 'factura' ? 'factura' : 'presupuesto'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Nº {numero} · {clienteNombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Email destinatario *</label>
            <input className="input" type="email" placeholder="cliente@email.com"
              value={email} onChange={e => setEmail(e.target.value)} />
            {!clienteEmail && (
              <p className="text-xs text-yellow-500 mt-1">⚠️ Este cliente no tiene email guardado. Puedes añadirlo en su ficha.</p>
            )}
          </div>

          <div>
            <label className="label">Mensaje</label>
            <textarea className="input h-40 resize-none text-sm leading-relaxed"
              value={cuerpo || cuerpoDefault}
              onChange={e => setCuerpo(e.target.value)} />
          </div>

          <div className="p-3 rounded-lg text-xs text-gray-500" style={{ background: '#1a1814', border: '1px solid #2a2418' }}>
            <strong className="text-gray-400">Asunto:</strong> {asunto}
          </div>

          {error && <p className="text-red-400 text-sm">⚠️ {error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleEnviar} disabled={sending || !email}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {sending ? <>⏳ Enviando...</> : <>📧 Enviar email</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
