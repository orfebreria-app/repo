import { useState } from 'react'

const EMAILJS_SERVICE  = 'service_6xkpbdq'
const EMAILJS_TEMPLATE = 'template_4uj5s2j'
const EMAILJS_PUBKEY   = 'b__oNpMqVdXfGv4Y2'

export default function ModalEnviarEmail({ tipo, numero, clienteEmail, clienteNombre, empresaNombre, onClose }) {
  const [email,   setEmail]   = useState(clienteEmail || '')
  const [cuerpo,  setCuerpo]  = useState('')
  const [sending, setSending] = useState(false)
  const [ok,      setOk]      = useState(false)
  const [error,   setError]   = useState('')

  const asunto = tipo === 'factura'
    ? `Factura ${numero} — ${empresaNombre}`
    : `Presupuesto ${numero} — ${empresaNombre}`

  const cuerpoDefault = tipo === 'factura'
    ? `Estimado/a ${clienteNombre || 'cliente'},\n\nAdjunto le enviamos la factura nº ${numero}.\n\nQuedamos a su disposición para cualquier consulta.\n\nUn cordial saludo,\n${empresaNombre}\ninfo@trofeosaka.es`
    : `Estimado/a ${clienteNombre || 'cliente'},\n\nNos complace hacerle llegar el presupuesto nº ${numero} que nos solicitó.\n\nTiene una validez de 30 días. Si desea aceptarlo o tiene alguna duda, no dude en contactarnos.\n\nUn cordial saludo,\n${empresaNombre}\ninfo@trofeosaka.es`

  const textoFinal = cuerpo || cuerpoDefault

  const handleEnviar = async () => {
    if (!email.trim() || !email.includes('@')) return setError('Introduce un email válido')
    setSending(true)
    setError('')
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id:  EMAILJS_SERVICE,
          template_id: EMAILJS_TEMPLATE,
          user_id:     EMAILJS_PUBKEY,
          template_params: {
            to_email:  email.trim(),
            to_name:   clienteNombre || email.trim(),
            from_name: empresaNombre,
            subject:   asunto,
            message:   textoFinal,
            reply_to:  'info@trofeosaka.es',
          },
        }),
      })
      if (res.ok) { setOk(true) }
      else { const txt = await res.text(); setError(`Error: ${txt}`) }
    } catch (err) { setError(err.message) }
    setSending(false)
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
            <h3 className="text-lg font-bold text-white">📧 Enviar {tipo === 'factura' ? 'factura' : 'presupuesto'}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Nº {numero} · {clienteNombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Email destinatario *</label>
            <input className="input" type="email" placeholder="cliente@email.com"
              value={email} onChange={e => setEmail(e.target.value)} />
            {!clienteEmail && <p className="text-xs text-yellow-500 mt-1">⚠️ Este cliente no tiene email guardado. Puedes añadirlo en su ficha.</p>}
          </div>
          <div>
            <label className="label">Mensaje</label>
            <textarea className="input h-44 resize-none text-sm leading-relaxed"
              value={cuerpo || cuerpoDefault}
              onChange={e => setCuerpo(e.target.value)} />
          </div>
          <div className="p-3 rounded-lg text-xs text-gray-500" style={{ background:'#1a1814', border:'1px solid #2a2418' }}>
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
