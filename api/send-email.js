import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Verificación de sesión ─────────────────────────
  // Sin esto, cualquiera que descubra esta URL podría enviar
  // correos usando tu cuenta de Resend y tu dominio, sin estar
  // logueado en la app.
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'No autenticado' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Configuración de Supabase incompleta' })

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'No autenticado' })

  const { to, subject, html, fromName } = req.body
  if (!to || !subject || !html) return res.status(400).json({ error: 'Faltan campos' })

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'No configurada la API key de Resend' })

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName || 'Trofeos AKA'} <info@trofeosaka.es>`,
        to: [to],
        subject,
        html,
      }),
    })

    const data = await response.json()
    if (!response.ok) return res.status(400).json({ error: data.message || 'Error al enviar' })
    return res.status(200).json({ ok: true, id: data.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
