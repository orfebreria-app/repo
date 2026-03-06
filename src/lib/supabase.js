import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Faltan variables de entorno de Supabase. Crea un archivo .env basado en .env.example')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Auth helpers ──────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password })

export const signOut = () =>
  supabase.auth.signOut()

export const getUser = () =>
  supabase.auth.getUser()

// ── Empresa helpers ───────────────────────────────────
export const getEmpresa = async (userId) => {
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('user_id', userId)
    .single()
  return { data, error }
}

export const upsertEmpresa = async (empresa) => {
  const { data, error } = await supabase
    .from('empresas')
    .upsert(empresa)
    .select()
    .single()
  return { data, error }
}

// ── Clientes helpers ──────────────────────────────────
export const getClientes = async (empresaId) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nombre')
  return { data: data || [], error }
}

export const upsertCliente = async (cliente) => {
  const { data, error } = await supabase
    .from('clientes')
    .upsert(cliente)
    .select()
    .single()
  return { data, error }
}

export const deleteCliente = async (id) => {
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  return { error }
}

// ── Facturas helpers ──────────────────────────────────
export const getFacturas = async (empresaId) => {
  const { data, error } = await supabase
    .from('facturas')
    .select(`*, clientes(nombre, email)`)
    .eq('empresa_id', empresaId)
    .order('creado_en', { ascending: false })
  return { data: data || [], error }
}

export const getFactura = async (id) => {
  const { data, error } = await supabase
    .from('facturas')
    .select(`*, clientes(*), conceptos_factura(*)`)
    .eq('id', id)
    .single()
  return { data, error }
}

export const createFactura = async (factura, conceptos) => {
  // 1. Crear factura
  const { data: fact, error: errFact } = await supabase
    .from('facturas')
    .insert(factura)
    .select()
    .single()
  if (errFact) return { data: null, error: errFact }

  // 2. Crear conceptos
  const items = conceptos.map((c, i) => ({ ...c, factura_id: fact.id, orden: i }))
  const { error: errConc } = await supabase.from('conceptos_factura').insert(items)
  if (errConc) return { data: null, error: errConc }

  // 3. Incrementar folio en empresa
  await supabase.rpc('increment_folio', { empresa_id_param: factura.empresa_id })
    .catch(() => {}) // si la función no existe, no bloquea

  return { data: fact, error: null }
}

export const updateEstadoFactura = async (id, estado) => {
  const { data, error } = await supabase
    .from('facturas')
    .update({ estado })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deleteFactura = async (id) => {
  const { error } = await supabase.from('facturas').delete().eq('id', id)
  return { error }
}

// ── Helpers de formato ────────────────────────────────
export const formatEuro = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)

export const formatFecha = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
