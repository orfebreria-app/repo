import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Faltan variables de entorno de Supabase. Crea un archivo .env basado en .env.example')
}

const demoEmpresa = {
  id: 'local-demo-company',
  user_id: 'demo-user',
  nombre: 'Empresa Demo',
  nif_cif: 'B00000000',
  factura_config: {},
}

const demoCliente = {
  id: 'cliente-demo-1',
  empresa_id: 'local-demo-company',
  nombre: 'Cliente Demo',
  email: 'cliente@example.com',
}

const demoProducto = {
  id: 'producto-demo-1',
  empresa_id: 'local-demo-company',
  nombre: 'Producto Demo',
  referencia: 'PROD-001',
  activo: true,
}

const demoFacturas = [
  {
    id: 'demo-factura-1',
    empresa_id: 'local-demo-company',
    cliente_id: 'cliente-demo-1',
    folio: 'FAC-0002',
    fecha_emision: '2026-07-29',
    fecha_vencimiento: '2026-08-28',
    estado: 'emitida',
    subtotal: 100,
    iva_total: 21,
    total: 121,
    notas: 'Factura demo',
  },
]

let demoFacturasStore = [...demoFacturas]
let demoConceptosStore = []

export const isLocalDevMode = () => {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || ''
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
      return true
    }
  }

  return !supabaseUrl || !supabaseKey
}

class QueryBuilder {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.filters = []
    this.orderBy = null
    this.selectColumns = '*'
    this.mode = 'list'
    this.operation = 'select'
    this.values = null
    this.limitCount = null
  }

  select(columns = '*') {
    this.selectColumns = columns
    return this
  }

  eq(column, value) {
    this.filters.push({ column, value })
    return this
  }

  order(column, options = {}) {
    this.orderBy = { column, ascending: options.ascending !== false }
    return this
  }

  limit(value) {
    this.limitCount = value
    return this
  }

  single() {
    this.mode = 'single'
    return this
  }

  insert(values) {
    this.operation = 'insert'
    this.values = values
    return this
  }

  update(values) {
    this.operation = 'update'
    this.values = values
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  upsert(values) {
    this.operation = 'upsert'
    this.values = values
    return this
  }

  async execute() {
    const { table, filters, orderBy, mode, operation, values, limitCount } = this

    if (table === 'empresas') {
      if (operation === 'insert' || operation === 'upsert') {
        const empresa = { ...demoEmpresa, ...(values || {}) }
        return { data: empresa, error: null }
      }

      const data = [demoEmpresa].filter((item) => {
        const userFilter = filters.find((f) => f.column === 'user_id')
        if (userFilter) return item.user_id === userFilter.value
        return true
      })

      const result = mode === 'single' ? data[0] || null : data
      return { data: result, error: null }
    }

    if (table === 'clientes') {
      const data = [demoCliente].filter((item) => !filters.length || filters.every((f) => item[f.column] === f.value))
      const result = mode === 'single' ? data[0] || null : data
      return { data: result, error: null }
    }

    if (table === 'productos') {
      const data = [demoProducto].filter((item) => !filters.length || filters.every((f) => item[f.column] === f.value))
      const result = mode === 'single' ? data[0] || null : data
      return { data: result, error: null }
    }

    if (table === 'conceptos_factura') {
      if (operation === 'insert') {
        demoConceptosStore = [...demoConceptosStore, ...(Array.isArray(values) ? values : [values])]
      }
      return { data: null, error: null }
    }

    if (table === 'facturas') {
      if (operation === 'insert' || operation === 'upsert') {
        const factura = {
          id: values?.id || `factura-${Date.now()}`,
          ...values,
          created_at: new Date().toISOString(),
        }
        demoFacturasStore = [factura, ...demoFacturasStore]
        return { data: factura, error: null }
      }

      if (operation === 'delete') {
        demoFacturasStore = demoFacturasStore.filter((item) => !filters.every((f) => item[f.column] === f.value))
        return { data: null, error: null }
      }

      if (operation === 'update') {
        demoFacturasStore = demoFacturasStore.map((item) => {
          const matches = filters.every((f) => item[f.column] === f.value)
          return matches ? { ...item, ...values } : item
        })
        const updated = demoFacturasStore.find((item) => filters.every((f) => item[f.column] === f.value)) || null
        return { data: updated, error: null }
      }

      let data = [...demoFacturasStore]
      data = data.filter((item) => filters.every((f) => item[f.column] === f.value))

      if (orderBy) {
        data.sort((a, b) => {
          const av = a[orderBy.column]
          const bv = b[orderBy.column]
          if (av === bv) return 0
          return orderBy.ascending ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
        })
      }

      if (typeof limitCount === 'number') {
        data = data.slice(0, limitCount)
      }

      const result = mode === 'single' ? data[0] || null : data
      return { data: result, error: null }
    }

    return { data: null, error: null }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  catch(reject) {
    return this.execute().catch(reject)
  }
}

export const createSupabaseClient = (url = supabaseUrl, key = supabaseKey) => {
  if (!url || !key || isLocalDevMode()) {
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithPassword: async () => ({ data: { session: null }, error: null }),
        signUp: async () => ({ data: { session: null }, error: null }),
        signOut: async () => ({ error: null }),
      },
      from: (table) => new QueryBuilder(table, null),
      rpc: async (name, params = {}) => {
        if (name === 'increment_folio') return { data: null, error: null }
        if (name === 'verificar_factura') {
          const { p_folio, p_nif, p_total, p_fecha, p_id, p_empresa_id } = params
          const match = demoFacturasStore.find((item) => {
            const folioMatch = !p_folio || String(item.folio || '').trim() === String(p_folio).trim()
            const nifMatch = !p_nif || item.empresa_id === p_empresa_id || p_nif === 'B00000000'
            const totalMatch = p_total == null || Math.abs(Number(item.total || 0) - Number(p_total || 0)) < 0.01
            const fechaMatch = !p_fecha || String(item.fecha_emision).slice(0, 10) === String(p_fecha).slice(0, 10)
            const idMatch = !p_id || String(item.id || '').trim() === String(p_id || '').trim()
            const empresaMatch = !p_empresa_id || item.empresa_id === p_empresa_id
            return folioMatch && nifMatch && totalMatch && fechaMatch && idMatch && empresaMatch
          })

          return { data: match ? [match] : [], error: null }
        }

        return { data: null, error: null }
      },
    }
  }

  return createClient(url, key)
}

export const getSupabaseClient = () => createSupabaseClient(supabaseUrl, supabaseKey)

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getSupabaseClient()
    return client[prop]
  },
})

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
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('user_id', userId)
    .single()
  return { data, error }
}

export const construirFolioFactura = ({ folio, serie = 'FAC', fallbackNumero = 1 }) => {
  const base = String(serie || 'FAC').replace(/-$/, '')

  if (folio !== null && folio !== undefined && folio !== '') {
    const texto = String(folio).trim()
    if (/^\d+$/.test(texto)) {
      return `${base}-${String(Number(texto)).padStart(4, '0')}`
    }
    if (texto) return texto
  }

  return `${base}-${String(fallbackNumero).padStart(4, '0')}`
}

export const calcPrecioVentaSugerido = ({ precio_compra, margen = 0.3, iva = 21 }) => {
  const compra = Number(precio_compra || 0)
  const margenPorcentaje = Number(margen || 0)
  const ivaPorcentaje = Number(iva || 0)
  const precioSinIva = compra * (1 + margenPorcentaje)
  const precioConIva = precioSinIva * (1 + ivaPorcentaje / 100)
  return Number(precioConIva.toFixed(2))
}

export const resolverFolioFactura = ({ folio, serie = 'FAC', existingFolios = [] }) => {
  const base = String(serie || 'FAC').replace(/-$/, '')
  const normalized = existingFolios.map((item) => String(item || '').trim())
  const existingNumbers = normalized
    .map((value) => {
      const match = value.match(/(\d+)$/)
      return match ? Number(match[1]) : null
    })
    .filter((value) => Number.isFinite(value))

  const next = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1
  return `${base}-${String(next).padStart(4, '0')}`
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
    .order('fecha_emision', { ascending: false })
  // Ordenar por número extraído del folio (FAC-0012 → 12)
  const sorted = (data || []).sort((a, b) => {
    const numA = parseInt((a.folio || '').replace(/\D/g, '')) || 0
    const numB = parseInt((b.folio || '').replace(/\D/g, '')) || 0
    return numB - numA
  })
  return { data: sorted, error }
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
  const { data: fact, error: errFact } = await supabase
    .from('facturas')
    .insert(factura)
    .select()
    .single()
  if (errFact) return { data: null, error: errFact }

  const items = conceptos.map((c, i) => ({ ...c, factura_id: fact.id, orden: i }))
  const { error: errConc } = await supabase.from('conceptos_factura').insert(items)
  if (errConc) return { data: null, error: errConc }

  await supabase.rpc('increment_folio', { empresa_id_param: factura.empresa_id })
    .catch(() => {})

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

// ── Proveedores ───────────────────────────────────────
export const getProveedores = async (empresaId) => {
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

  // Guardar plazos de vencimiento si los hay
  if (vencimientos.length > 0) {
    const plazos = vencimientos.map(v => ({
      factura_id: fp.id, empresa_id: factura.empresa_id,
      fecha: v.fecha, importe: Number(v.importe), notas: v.notas || null,
    }))
    await supabase.from('vencimientos_factura_proveedor').insert(plazos)
  }

  // Sumar stock de productos vinculados y actualizar precio de compra
  for (const linea of lineas.filter(l => l.producto_id)) {
    const { data: prod } = await supabase
      .from('productos')
      .select('stock_actual')
      .eq('id', linea.producto_id)
      .single()
    if (!prod) continue
    const anterior  = Number(prod.stock_actual)
    const posterior = anterior + Number(linea.cantidad)
    await supabase.from('productos').update({
      stock_actual:  posterior,
      precio_compra: Number(linea.precio_unitario), // ← actualizar precio compra
    }).eq('id', linea.producto_id)
    await supabase.from('movimientos_stock').insert({
      empresa_id: factura.empresa_id, producto_id: linea.producto_id,
      tipo: 'entrada', cantidad: Number(linea.cantidad),
      stock_anterior: anterior, stock_posterior: posterior,
      referencia_id: fp.id, referencia_tipo: 'compra',
      notas: `Factura proveedor ${factura.numero || fp.id.slice(0,8)}`,
    })
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

// ── Verificación pública de facturas (para /verificar) ─
export const verificarFactura = async ({ folio, nif, total, fecha, id, empresa_id }) => {
  try {
    const { data, error } = await supabase.rpc('verificar_factura', {
      p_folio: folio || null,
      p_nif: nif || null,
      p_total: total || null,
      p_fecha: fecha || null,
      p_id: id || null,
      p_empresa_id: empresa_id || null,
    })

    if (!error) {
      return { data: Array.isArray(data) ? data[0] || null : data || null, error: null }
    }
  } catch (err) {
    console.warn('RPC de verificación no disponible, usando fallback.', err)
  }

  try {
    const apiUrl = typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/api/verificar-factura`
      : '/api/verificar-factura'

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folio, nif, total, fecha, id, empresa_id }),
    })

    const payload = await response.json()
    if (!response.ok) return { data: null, error: new Error(payload.error || 'No se pudo verificar la factura') }
    return { data: payload.data || null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
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
