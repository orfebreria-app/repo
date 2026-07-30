import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || null
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Configuración de Supabase incompleta' })

  const { folio, nif, total, fecha, id, empresa_id } = req.body || {}
  if (!folio && !id) return res.status(400).json({ error: 'Faltan datos para verificar la factura' })

  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
  const publicClient = createClient(supabaseUrl, supabaseKey, clientOptions)
  const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, clientOptions) : null
  const supabase = adminClient || publicClient

  try {
    let empresa = null
    if (empresa_id) {
      const { data: empresas, error: errEmp } = await supabase
        .from('empresas')
        .select('id, nombre, nif_cif')
        .eq('id', empresa_id)
        .limit(1)
      if (!errEmp && empresas?.length) empresa = empresas[0]
    }

    if (!empresa && nif) {
      const { data: empresasPorNif, error: errNif } = await supabase
        .from('empresas')
        .select('id, nombre, nif_cif')
        .eq('nif_cif', nif)
        .limit(1)
      if (!errNif && empresasPorNif?.length) empresa = empresasPorNif[0]
    }

    let query = supabase.from('facturas').select('id, folio, fecha_emision, total, estado, empresa_id')
    if (empresa_id) query = query.eq('empresa_id', empresa_id)
    if (id) query = query.eq('id', id)
    if (folio) query = query.eq('folio', folio)

    const { data: facturas, error: errFact } = await query.limit(10)
    if (errFact) throw errFact

    const factura = (facturas || []).find(item => {
      const totalCoincide = Math.abs(Number(item.total || 0) - Number(total || 0)) < 0.01
      const fechaCoincide = !fecha || String(item.fecha_emision).slice(0, 10) === String(fecha).slice(0, 10)
      const folioCoincide = !folio || String(item.folio || '').trim() === String(folio || '').trim()
      const idCoincide = !id || String(item.id || '').trim() === String(id || '').trim()
      return totalCoincide && fechaCoincide && folioCoincide && idCoincide
    })

    if (!factura) return res.status(200).json({ data: null })

    return res.status(200).json({
      data: {
        valido: true,
        folio: factura.folio,
        fecha_emision: factura.fecha_emision,
        total: Number(factura.total || 0),
        estado: factura.estado,
        empresa_nombre: empresa?.nombre || 'Empresa',
        hash: null,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error al verificar factura' })
  }
}
