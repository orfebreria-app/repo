export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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
