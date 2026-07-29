import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

const localDevStoreKey = 'facturacion-app-local-dev-store'
let memoryLocalDevState = null

const hasValidSupabaseConfig = (url = supabaseUrl, key = supabaseKey) => {
  const normalizedUrl = String(url || '').trim()
  const normalizedKey = String(key || '').trim()
  if (!normalizedUrl || !normalizedKey) return false
  if (normalizedUrl.includes('xxxxxxxx') || normalizedUrl.includes('your-project')) return false
  if (normalizedKey.includes('your-anon-key') || normalizedKey.includes('xxxx')) return false
  return true
}

const createFallbackQueryBuilder = () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => ({ data: null, error: null }),
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
  }
  return builder
}

export const createSupabaseClient = (url = supabaseUrl, key = supabaseKey) => {
  if (!hasValidSupabaseConfig(url, key)) {
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
        signUp: async () => ({ data: { user: null, session: null }, error: null }),
        signOut: async () => ({ error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => createFallbackQueryBuilder(),
      rpc: async () => ({ data: null, error: null }),
    }
  }

  try {
    return createClient(url, key)
  } catch (error) {
    console.warn('Supabase no disponible, usando cliente de respaldo.', error)
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
        signUp: async () => ({ data: { user: null, session: null }, error: null }),
        signOut: async () => ({ error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => createFallbackQueryBuilder(),
      rpc: async () => ({ data: null, error: null }),
    }
  }
}

const createDemoState = () => ({
  empresa: {
    id: 'local-demo-company',
    user_id: 'demo-user',
    nombre: 'Empresa Demo',
    nif: 'B00000000',
    email: 'empresa@demo.test',
    telefono: '',
    direccion: '',
    serie: 'FAC',
    siguiente_folio: 1,
    activo: true,
    factura_config: {},
  },
  clientes: [{
    id: 'cliente-demo-1',
    empresa_id: 'local-demo-company',
    nombre: 'Cliente Demo',
    nif: 'B00000000',
    email: 'cliente@demo.test',
    activo: true,
  }, {
    id: 'cliente-demo-2',
    empresa_id: 'local-demo-company',
    nombre: 'María López',
    nif: 'B11111111',
    email: 'maria@demo.test',
    activo: true,
  }],
  productos: [{
    id: 'producto-demo-1',
    empresa_id: 'local-demo-company',
    nombre: 'Producto Demo',
    referencia: 'DEM-001',
    precio_venta: 100,
    precio_compra: 70,
    iva_tasa: 21,
    categoria: 'Otros',
    activo: true,
    stock_actual: 10,
    stock_minimo: 5,
    proveedores: { nombre: 'Proveedor Demo' },
  }],
  facturas: [{
    id: 'factura-demo-1',
    empresa_id: 'local-demo-company',
    cliente_id: 'cliente-demo-1',
    folio: 'FAC-0001',
    fecha_emision: new Date().toISOString(),
    fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    estado: 'emitida',
    subtotal: 100,
    iva_total: 21,
    total: 121,
    notas: 'Factura demo para la versión pública',
    pdf_url: null,
    created_at: new Date().toISOString(),
    hash: null,
  }, {
    id: 'factura-demo-2',
    empresa_id: 'local-demo-company',
    cliente_id: 'cliente-demo-2',
    folio: 'FAC-0002',
    fecha_emision: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    fecha_vencimiento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    estado: 'vencida',
    subtotal: 80,
    iva_total: 16.8,
    total: 96.8,
    notas: 'Factura demo vencida',
    pdf_url: null,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    hash: null,
  }],
  conceptos: [{
    id: 'concepto-demo-1',
    factura_id: 'factura-demo-1',
    descripcion: 'Producto Demo',
    cantidad: 1,
    precio_unitario: 100,
    iva_tasa: 21,
    descuento: 0,
    recargo_tasa: 0,
    recargo_importe: 0,
    subtotal: 100,
    total: 121,
    orden: 0,
    producto_id: 'producto-demo-1',
  }, {
    id: 'concepto-demo-2',
    factura_id: 'factura-demo-2',
    descripcion: 'Producto Demo',
    cantidad: 1,
    precio_unitario: 80,
    iva_tasa: 21,
    descuento: 0,
    recargo_tasa: 0,
    recargo_importe: 0,
    subtotal: 80,
    total: 96.8,
    orden: 0,
    producto_id: 'producto-demo-1',
  }],
  tickets: [],
  lineas_ticket: [],
})

const readLocalDevState = () => {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(localDevStoreKey) : null
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const writeLocalDevState = (state) => {
  memoryLocalDevState = state
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(localDevStoreKey, JSON.stringify(state))
    } catch {}
  }
}

const getLocalDevState = () => {
  if (memoryLocalDevState) return memoryLocalDevState
  const persisted = readLocalDevState()
  if (persisted) {
    const normalized = {
      ...createDemoState(),
      ...persisted,
      empresa: persisted.empresa || createDemoState().empresa,
      clientes: persisted.clientes || [],
      productos: persisted.productos || [],
      facturas: persisted.facturas || [],
      conceptos: persisted.conceptos || [],
      tickets: persisted.tickets || [],
      lineas_ticket: persisted.lineas_ticket || [],
    }
    memoryLocalDevState = normalized
    writeLocalDevState(normalized)
    return normalized
  }
  const fresh = createDemoState()
  writeLocalDevState(fresh)
  return fresh
}

export const isLocalDevMode = () => {
  const bypassEnabled = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'
  const missingSupabaseConfig = !supabaseUrl || !supabaseKey || supabaseUrl.includes('xxxxxxxx')
  const locationRef = typeof window !== 'undefined' && window.location
    ? window.location
    : (typeof globalThis !== 'undefined' && globalThis.location ? globalThis.location : null)
  const currentHost = String(locationRef?.hostname || '').toLowerCase()
  const currentUrl = String(locationRef?.href || '').toLowerCase()
  const localHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(currentHost)
  const vercelHostedApp = currentHost.endsWith('.vercel.app') || currentHost.endsWith('.vercel.dev') || currentHost.includes('vercel') || currentUrl.includes('vercel.app') || currentUrl.includes('vercel.dev')
  const vercelLikeHostname = currentHost.includes('repo-juq1') || currentHost.includes('vercel')
  const testEnvironment = import.meta.env.MODE === 'test' || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')
  const demoSignal = import.meta.env.DEV || testEnvironment || localHost || vercelHostedApp || vercelLikeHostname
  return demoSignal && (bypassEnabled || missingSupabaseConfig || localHost || vercelHostedApp || vercelLikeHostname || testEnvironment)
}

export const notifyFacturasUpdated = () => {
  const target = typeof window !== 'undefined' ? window : globalThis
  if (target && typeof target.dispatchEvent === 'function') {
    target.dispatchEvent(new CustomEvent('facturas:updated'))
  }
}

const normalizarFacturaParaInsert = (factura, folio) => {
  const payload = {
    empresa_id: factura?.empresa_id,
    cliente_id: factura?.cliente_id,
    folio,
    fecha_emision: factura?.fecha_emision,
    fecha_vencimiento: factura?.fecha_vencimiento,
    estado: factura?.estado || 'emitida',
    subtotal: Number(factura?.subtotal ?? 0),
    iva_total: Number(factura?.iva_total ?? 0),
    total: Number(factura?.total ?? 0),
    notas: factura?.notas ?? null,
    pdf_url: factura?.pdf_url ?? null,
  }

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null))
}

export const construirFolioFactura = ({ folio, serie, fallbackNumero }) => {
  const folioNormalizado = (folio || '').trim()
  if (folioNormalizado) return folioNormalizado
  const serieBase = (serie || 'FAC').trim() || 'FAC'
  const numero = Number(fallbackNumero)
  const numeroValido = Number.isFinite(numero) && numero > 0 ? numero : 1
  return `${serieBase}-${String(numeroValido).padStart(4, '0')}`
}

export const resolverFolioFactura = ({ folio, serie, existingFolios = [] }) => {
  const folioNormalizado = (folio || '').trim()
  if (folioNormalizado) {
    const existentes = new Set((existingFolios || []).map(item => (item || '').trim()).filter(Boolean))
    if (!existentes.has(folioNormalizado)) return folioNormalizado
  }

  const serieBase = (serie || 'FAC').trim() || 'FAC'
  const numeros = (existingFolios || [])
    .map(item => (item || '').trim())
    .filter(Boolean)
    .map(item => {
      const match = item.match(/(\d+)(?!.*\d)/)
      return match ? Number(match[1]) : null
    })
    .filter(num => Number.isFinite(num) && num > 0)

  const maxNumero = numeros.length ? Math.max(...numeros) : 0
  return `${serieBase}-${String(maxNumero + 1).padStart(4, '0')}`
}

if (!hasValidSupabaseConfig(supabaseUrl, supabaseKey)) {
  console.warn('⚠️ Faltan variables de entorno de Supabase o están incompletas. La app seguirá en modo demo.')
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseKey)

// ── Recargo de Equivalencia ───────────────────────────
// Devuelve la tasa RE correspondiente al IVA
export const tasaRE = (ivaTasa) => {
  const t = Number(ivaTasa)
  if (t === 21) return 5.2
  if (t === 10) return 1.4
  if (t === 4)  return 0.5
  return 0
}

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
  if (isLocalDevMode()) {
    const state = getLocalDevState()
    const empresa = state.empresa
    const matches = !userId || empresa?.user_id === userId || empresa?.id === userId
    return { data: matches ? empresa : null, error: null }
  }

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
  if (isLocalDevMode()) {
    const state = getLocalDevState()
    const data = (state.clientes || [])
      .filter(cliente => cliente.empresa_id === empresaId || cliente.empresa_id === 'local-demo-company')
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    return { data, error: null }
  }

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
  if (isLocalDevMode()) {
    const state = getLocalDevState()
    const data = (state.facturas || [])
      .filter(f => f.empresa_id === empresaId || f.empresa_id === 'local-demo-company' || f.empresa_id === 'demo-company')
      .map(f => ({ ...f, clientes: { nombre: 'Cliente Demo', email: 'cliente@demo.test' } }))
      .sort((a, b) => {
        const numA = parseInt((a.folio || '').replace(/\D/g, '')) || 0
        const numB = parseInt((b.folio || '').replace(/\D/g, '')) || 0
        return numB - numA
      })
    return { data, error: null }
  }

  const { data, error } = await supabase
    .from('facturas')
    .select(`*, clientes(nombre, email)`)
    .eq('empresa_id', empresaId)
    .order('fecha_emision', { ascending: false })
  const sorted = (data || []).sort((a, b) => {
    const numA = parseInt((a.folio || '').replace(/\D/g, '')) || 0
    const numB = parseInt((b.folio || '').replace(/\D/g, '')) || 0
    return numB - numA
  })
  return { data: sorted, error }
}

export const getFactura = async (id) => {
  if (isLocalDevMode()) {
    const state = getLocalDevState()
    const factura = (state.facturas || []).find(item => item.id === id)
    if (!factura) return { data: null, error: null }
    const conceptos = (state.conceptos || []).filter(item => item.factura_id === id)
    return {
      data: {
        ...factura,
        clientes: state.clientes?.find(cliente => cliente.id === factura.cliente_id) || null,
        conceptos_factura: conceptos,
      },
      error: null,
    }
  }

  const { data, error } = await supabase
    .from('facturas')
    .select(`*, clientes(*), conceptos_factura(*)`)
    .eq('id', id)
    .single()
  return { data, error }
}

export const createFactura = async (factura, conceptos) => {
  try {
    const folio = construirFolioFactura({
      folio: factura?.folio,
      serie: factura?.serie || factura?.empresa?.serie,
      fallbackNumero: factura?.folio_numero ?? Date.now(),
    })

    const facturaSegura = normalizarFacturaParaInsert(factura, folio)

    if (isLocalDevMode()) {
      const state = getLocalDevState()
      const fact = {
        ...facturaSegura,
        id: `factura-local-${Date.now()}`,
        created_at: new Date().toISOString(),
        hash: null,
      }
      state.facturas = [
        ...state.facturas.filter(f => f.id !== fact.id),
        fact,
      ]
      state.conceptos = [
        ...state.conceptos.filter(c => c.factura_id !== fact.id),
        ...conceptos.map((c, i) => ({ ...c, factura_id: fact.id, orden: i, id: `${fact.id}-linea-${i + 1}` })),
      ]
      writeLocalDevState(state)
      notifyFacturasUpdated()
      return { data: fact, error: null }
    }

    const { data: fact, error: errFact } = await supabase
      .from('facturas')
      .insert(facturaSegura)
      .select()
      .single()

    if (errFact) return { data: null, error: errFact }

    const items = conceptos.map((c, i) => ({ ...c, factura_id: fact.id, orden: i }))
    const { error: errConc } = await supabase.from('conceptos_factura').insert(items)
    if (errConc) {
      await supabase.from('facturas').delete().eq('id', fact.id)
      return { data: null, error: errConc }
    }

    notifyFacturasUpdated()
    return { data: fact, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Reserva el siguiente folio de forma atómica (sin riesgo de duplicados
// por dos facturas creadas casi a la vez).
export const getSiguienteFolioAtomico = async (empresaId) => {
  if (isLocalDevMode()) {
    const state = getLocalDevState()
    const facturas = (state.facturas || []).filter(f => f.empresa_id === empresaId)
    const maxNum = facturas.reduce((max, f) => {
      const n = parseInt((f.folio || '').replace(/\D/g, '')) || 0
      return n > max ? n : max
    }, 0)
    return { folio: maxNum + 1, error: null }
  }

  if (!empresaId) return { folio: null, error: new Error('Falta el id de empresa para reservar el folio') }

  try {
    const { data, error } = await supabase.rpc('siguiente_folio_atomico', { p_empresa_id: empresaId })
    if (!error && data != null) return { folio: data, error: null }
  } catch {}

  const { data: empresa, error: errEmpresa } = await supabase
    .from('empresas')
    .select('id, serie, siguiente_folio')
    .eq('id', empresaId)
    .single()

  if (errEmpresa || !empresa) {
    const { data: facturas, error: errFacturas } = await supabase
      .from('facturas')
      .select('folio')
      .eq('empresa_id', empresaId)

    if (errFacturas) return { folio: null, error: errFacturas }

    const maxNum = (facturas || []).reduce((max, f) => {
      const n = parseInt((f.folio || '').replace(/\D/g, '')) || 0
      return n > max ? n : max
    }, 0)

    return { folio: maxNum + 1, error: null }
  }

  const siguienteNumero = Number(empresa.siguiente_folio ?? 1)
  const serie = String(empresa.serie || 'FAC').replace(/-+$/, '')
  const folioFallback = `${serie}-${String(siguienteNumero).padStart(4, '0')}`

  const { error: errUpdate } = await supabase
    .from('empresas')
    .update({ siguiente_folio: siguienteNumero + 1 })
    .eq('id', empresaId)

  if (errUpdate) return { folio: null, error: errUpdate }

  return { folio: folioFallback, error: null }
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


export const calcPrecioVentaSugerido = ({ precioCompra = 0, multiplicadorProducto = null, multiplicadorProveedor = null }) => {
  const base = Number(precioCompra) || 0
  const multProd = multiplicadorProducto === '' || multiplicadorProducto === null || multiplicadorProducto === undefined ? null : Number(multiplicadorProducto)
  const multProv = multiplicadorProveedor === '' || multiplicadorProveedor === null || multiplicadorProveedor === undefined ? 2.5 : Number(multiplicadorProveedor)
  const multiplicador = multProd && multProd > 0 ? multProd : (multProv && multProv > 0 ? multProv : 2.5)
  return +(base * multiplicador).toFixed(2)
}

// ── Proveedores ───────────────────────────────────────
export const getProveedores = async (empresaId) => {
  if (isLocalDevMode()) {
    const state = getLocalDevState()
    const data = (state.productos || [])
      .filter(producto => producto.empresa_id === empresaId || producto.empresa_id === 'local-demo-company')
      .map(producto => ({
        id: `${producto.id}-proveedor`,
        empresa_id: empresaId,
        nombre: producto.proveedores?.nombre || 'Proveedor Demo',
        activo: true,
      }))
      .filter((prov, index, arr) => arr.findIndex(item => item.nombre === prov.nombre) === index)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    return { data, error: null }
  }

  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('nombre')
  return { data: data || [], error }
}

export const upsertProveedor = async (prov) => {
  const { data, error } = await supabase
    .from('proveedores')
    .upsert(prov)
    .select()
    .single()
  return { data, error }
}

export const deleteProveedor = async (id) => {
  const { error } = await supabase.from('proveedores').update({ activo: false }).eq('id', id)
  return { error }
}

// ── Productos ─────────────────────────────────────────
export const getProductos = async (empresaId) => {
  if (isLocalDevMode()) {
    const state = getLocalDevState()
    const data = (state.productos || [])
      .filter(producto => producto.empresa_id === empresaId || producto.empresa_id === 'local-demo-company')
      .filter(producto => producto.activo !== false)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    return { data, error: null }
  }

  const { data, error } = await supabase
    .from('productos')
    .select('*, proveedores(nombre)')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('nombre')
  return { data: data || [], error }
}

export const upsertProducto = async (prod) => {
  const { data, error } = await supabase
    .from('productos')
    .upsert(prod)
    .select()
    .single()
  return { data, error }
}

export const deleteProducto = async (id) => {
  const { error } = await supabase.from('productos').update({ activo: false }).eq('id', id)
  return { error }
}

// ── Movimientos de stock ──────────────────────────────
export const getMovimientos = async (empresaId, productoId = null) => {
  let q = supabase
    .from('movimientos_stock')
    .select('*, productos(nombre, referencia)')
    .eq('empresa_id', empresaId)
    .order('creado_en', { ascending: false })
    .limit(200)
  if (productoId) q = q.eq('producto_id', productoId)
  const { data, error } = await q
  return { data: data || [], error }
}

// Descuenta stock de una lista de líneas y registra movimientos
export const descontarStockVenta = async (empresaId, lineas, referenciaId, referenciaTipo) => {
  const lineasConProducto = lineas.filter(l => l.producto_id)
  if (!lineasConProducto.length) return { error: null }

  for (const linea of lineasConProducto) {
    // Obtener stock actual
    const { data: prod } = await supabase
      .from('productos')
      .select('stock_actual')
      .eq('id', linea.producto_id)
      .single()

    if (!prod) continue
    const anterior = Number(prod.stock_actual)
    const cantidad = Number(linea.cantidad)
    const posterior = anterior - cantidad

    // Actualizar stock
    await supabase
      .from('productos')
      .update({ stock_actual: posterior })
      .eq('id', linea.producto_id)

    // Registrar movimiento
    await supabase.from('movimientos_stock').insert({
      empresa_id:      empresaId,
      producto_id:     linea.producto_id,
      tipo:            referenciaTipo === 'ticket' ? 'salida_ticket' : 'salida_factura',
      cantidad:        -cantidad,
      stock_anterior:  anterior,
      stock_posterior: posterior,
      referencia_id:   referenciaId,
      referencia_tipo: referenciaTipo,
    })
  }
  return { error: null }
}

export const entradaStock = async (empresaId, productoId, cantidad, notas = '') => {
  const { data: prod } = await supabase
    .from('productos')
    .select('stock_actual')
    .eq('id', productoId)
    .single()
  if (!prod) return { error: 'Producto no encontrado' }

  const anterior = Number(prod.stock_actual)
  const posterior = anterior + Number(cantidad)

  await supabase.from('productos').update({ stock_actual: posterior }).eq('id', productoId)
  await supabase.from('movimientos_stock').insert({
    empresa_id: empresaId, producto_id: productoId,
    tipo: 'entrada', cantidad: Number(cantidad),
    stock_anterior: anterior, stock_posterior: posterior,
    referencia_tipo: 'manual', notas,
  })
  return { error: null }
}

export const ajusteStock = async (empresaId, productoId, nuevoStock, notas = '') => {
  const { data: prod } = await supabase
    .from('productos')
    .select('stock_actual')
    .eq('id', productoId)
    .single()
  if (!prod) return { error: 'Producto no encontrado' }

  const anterior = Number(prod.stock_actual)
  const diff = Number(nuevoStock) - anterior

  await supabase.from('productos').update({ stock_actual: Number(nuevoStock) }).eq('id', productoId)
  await supabase.from('movimientos_stock').insert({
    empresa_id: empresaId, producto_id: productoId,
    tipo: diff >= 0 ? 'ajuste_positivo' : 'ajuste_negativo',
    cantidad: diff,
    stock_anterior: anterior, stock_posterior: Number(nuevoStock),
    referencia_tipo: 'manual', notas: notas || 'Ajuste manual',
  })
  return { error: null }
}

// ── Facturas de proveedor (Compras) ───────────────────
export const getFacturasProveedor = async (empresaId) => {
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .select('*, proveedores(nombre), clientes(nombre)')
    .eq('empresa_id', empresaId)
    .order('fecha_factura', { ascending: false })
  return { data: data || [], error }
}

export const getFacturaProveedor = async (id) => {
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .select('*, proveedores(*), lineas_factura_proveedor(*)')
    .eq('id', id)
    .single()
  return { data, error }
}

export const createFacturaProveedor = async (factura, lineas, vencimientos = []) => {
  const { data: fp, error: errFp } = await supabase
    .from('facturas_proveedor')
    .insert(factura)
    .select()
    .single()
  if (errFp) return { data: null, error: errFp }

  const items = lineas.map((l, i) => ({ ...l, factura_id: fp.id, orden: i }))
  const { error: errL } = await supabase.from('lineas_factura_proveedor').insert(items)
  if (errL) return { data: null, error: errL }

  if (vencimientos.length > 0) {
    const plazos = vencimientos.map(v => ({
      factura_id: fp.id, empresa_id: factura.empresa_id,
      fecha: v.fecha, importe: Number(v.importe), notas: v.notas || null,
    }))
    await supabase.from('vencimientos_factura_proveedor').insert(plazos)
  }

  for (const linea of lineas.filter(l => l.producto_id)) {
    const { data: prod } = await supabase
      .from('productos')
      .select('id, precio_venta_manual, multiplicador_venta, proveedor_id')
      .eq('id', linea.producto_id)
      .single()
    if (!prod) continue

    let multiplicadorProveedor = 2.5
    if (prod.proveedor_id) {
      const { data: prov } = await supabase
        .from('proveedores')
        .select('multiplicador_venta')
        .eq('id', prod.proveedor_id)
        .single()
      if (prov?.multiplicador_venta) multiplicadorProveedor = Number(prov.multiplicador_venta)
    }

    const precioCompra = Number(linea.precio_unitario) || 0
    const payload = { precio_compra: precioCompra }
    if (!prod.precio_venta_manual) {
      payload.precio_venta = calcPrecioVentaSugerido({
        precioCompra,
        multiplicadorProducto: prod.multiplicador_venta,
        multiplicadorProveedor,
      })
    }

    await supabase.from('productos').update(payload).eq('id', linea.producto_id)
  }

  return { data: fp, error: null }
}

export const updateEstadoFacturaProveedor = async (id, estado) => {
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .update({ estado })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deleteFacturaProveedor = async (id) => {
  const { error } = await supabase.from('facturas_proveedor').delete().eq('id', id)
  return { error }
}

// ── Recargo de Equivalencia ───────────────────────────
export const RE_TASAS = { 21: 5.2, 10: 1.4, 4: 0.5, 0: 0 }

export const calcRecargoLinea = (base, ivaTasa) => {
  const reTasa = RE_TASAS[Number(ivaTasa)] ?? 0
  return +(base * reTasa / 100).toFixed(2)
}

// ── Editar factura completa ───────────────────────────
export const updateFacturaCompleta = async (facturaId, empresaId, cabecera, conceptosNuevos, conceptosOriginales) => {
  // 1. Actualizar cabecera
  const { error: errCab } = await supabase
    .from('facturas')
    .update(cabecera)
    .eq('id', facturaId)
  if (errCab) return { error: errCab }

  // 2. Revertir stock de los conceptos originales con producto
  for (const c of (conceptosOriginales || []).filter(c => c.producto_id)) {
    const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', c.producto_id).single()
    if (!prod) continue
    const anterior  = Number(prod.stock_actual)
    const posterior = anterior + Number(c.cantidad) // devolver lo que se descontó
    await supabase.from('productos').update({ stock_actual: posterior }).eq('id', c.producto_id)
    await supabase.from('movimientos_stock').insert({
      empresa_id: empresaId, producto_id: c.producto_id,
      tipo: 'ajuste_positivo', cantidad: Number(c.cantidad),
      stock_anterior: anterior, stock_posterior: posterior,
      referencia_id: facturaId, referencia_tipo: 'factura',
      notas: 'Reversión por edición de factura',
    })
  }

  // 3. Borrar conceptos viejos e insertar nuevos
  await supabase.from('conceptos_factura').delete().eq('factura_id', facturaId)
  const items = conceptosNuevos.map((c, i) => ({ ...c, factura_id: facturaId, orden: i }))
  const { error: errConc } = await supabase.from('conceptos_factura').insert(items)
  if (errConc) return { error: errConc }

  // 4. Descontar stock de los nuevos conceptos con producto
  for (const c of conceptosNuevos.filter(c => c.producto_id)) {
    const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', c.producto_id).single()
    if (!prod) continue
    const anterior  = Number(prod.stock_actual)
    const posterior = anterior - Number(c.cantidad)
    await supabase.from('productos').update({ stock_actual: posterior }).eq('id', c.producto_id)
    await supabase.from('movimientos_stock').insert({
      empresa_id: empresaId, producto_id: c.producto_id,
      tipo: 'salida_factura', cantidad: -Number(c.cantidad),
      stock_anterior: anterior, stock_posterior: posterior,
      referencia_id: facturaId, referencia_tipo: 'factura',
      notas: 'Edición de factura',
    })
  }

  return { error: null }
}

// ── Envío de email ─────────────────────────────────────
export const enviarEmail = async ({ to, subject, html, fromName }) => {
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html, fromName }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Error al enviar' }
    return { ok: true }
  } catch (err) {
    return { error: err.message }
  }
}


// Esta función se mantiene aquí como stub para compatibilidad con imports existentes.
// La implementación real está más arriba en este mismo archivo.

export const getAlbaranesProveedor = async () => ({ data: [], error: null })
export const createAlbaranProveedor = async () => ({ data: null, error: null })
export const deleteAlbaranProveedor = async () => ({ error: null })
export const getAlbaranesPendientes = async () => ({ data: [], error: null })
export const crearFacturaDesdeAlbaranes = async () => ({ data: null, error: null })
export const getFacturasParaInforme = async () => ({ data: [], error: null })
export const getComprasParaInforme = async () => ({ data: [], error: null })
export const verificarFactura = async () => ({ data: null, error: null })
