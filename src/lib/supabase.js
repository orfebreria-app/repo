import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Faltan variables de entorno de Supabase. Crea un archivo .env basado en .env.example')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

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
