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

  // Sella la factura en la cadena de huella. Si esto falla no se
  // deshace la factura (ya está guardada y es válida igualmente),
  // pero se avisa en consola para poder revisarlo.
  const { data: hash, error: errHash } = await supabase.rpc('sellar_factura', { p_factura_id: fact.id })
  if (errHash) console.error('No se pudo sellar la factura en la cadena de huella:', errHash)
  else fact.hash = hash

  return { data: fact, error: null }
}

// Reserva el siguiente folio de forma atómica (sin riesgo de duplicados
// por dos facturas creadas casi a la vez). Llamar SIEMPRE antes de
// createFactura cuando el folio no se ha editado manualmente.
export const getSiguienteFolioAtomico = async (empresaId) => {
  const { data, error } = await supabase.rpc('siguiente_folio_atomico', { p_empresa_id: empresaId })
  return { folio: data, error }
}

// ── Informe de IVA ─────────────────────────────────────
// Facturas emitidas (ventas) con sus líneas, para un rango de fechas.
// Se excluyen los borradores (no emitidos) y las canceladas.
export const getFacturasParaInforme = async (empresaId, desde, hasta) => {
  const { data, error } = await supabase
    .from('facturas')
    .select('*, conceptos_factura(*)')
    .eq('empresa_id', empresaId)
    .gte('fecha_emision', desde)
    .lte('fecha_emision', hasta)
    .not('estado', 'in', '(borrador,cancelada)')
  return { data: data || [], error }
}

// Facturas de compra recibidas de proveedores, para el mismo rango.
export const getComprasParaInforme = async (empresaId, desde, hasta) => {
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .select('*, lineas_factura_proveedor(*)')
    .eq('empresa_id', empresaId)
    .gte('fecha_factura', desde)
    .lte('fecha_factura', hasta)
    .neq('estado', 'cancelada')
  return { data: data || [], error }
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
    const { error } = await supabase.rpc('mover_stock', {
      p_producto_id: linea.producto_id,
      p_delta: -Number(linea.cantidad),
      p_tipo: referenciaTipo === 'ticket' ? 'salida_ticket' : 'salida_factura',
      p_referencia_id: referenciaId,
      p_referencia_tipo: referenciaTipo,
    })
    if (error) return { error }
  }
  return { error: null }
}

export const entradaStock = async (empresaId, productoId, cantidad, notas = '') => {
  const { error } = await supabase.rpc('mover_stock', {
    p_producto_id: productoId,
    p_delta: Number(cantidad),
    p_tipo: 'entrada',
    p_referencia_tipo: 'manual',
    p_notas: notas,
  })
  return { error }
}

export const ajusteStock = async (empresaId, productoId, nuevoStock, notas = '') => {
  const { error } = await supabase.rpc('fijar_stock', {
    p_producto_id: productoId,
    p_nuevo_stock: Number(nuevoStock),
    p_notas: notas || 'Ajuste manual',
  })
  return { error }
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
    await supabase.rpc('mover_stock', {
      p_producto_id: linea.producto_id,
      p_delta: Number(linea.cantidad),
      p_tipo: 'entrada',
      p_referencia_id: fp.id,
      p_referencia_tipo: 'compra',
      p_notas: `Factura proveedor ${factura.numero || fp.id.slice(0,8)}`,
    })
    // El precio de compra no es un contador (no hay condición de
    // carrera real en sobrescribirlo), así que se actualiza aparte.
    await supabase.from('productos').update({
      precio_compra: Number(linea.precio_unitario),
    }).eq('id', linea.producto_id)
  }

  return { data: fp, error: null }
}

// ── Albaranes de proveedor ─────────────────────────────
// El albarán registra la mercancía en cuanto llega (y suma el
// stock en ese momento). La factura, cuando llega después, se
// genera agrupando uno o varios albaranes ya recibidos — sin
// volver a tocar el stock, porque ya se sumó al recibir cada uno.

export const getAlbaranesProveedor = async (empresaId) => {
  const { data, error } = await supabase
    .from('albaranes_proveedor')
    .select('*, proveedores(nombre)')
    .eq('empresa_id', empresaId)
    .order('fecha_albaran', { ascending: false })
  return { data: data || [], error }
}

// Albaranes de un proveedor concreto que aún no se han facturado
export const getAlbaranesPendientes = async (empresaId, proveedorId) => {
  const { data, error } = await supabase
    .from('albaranes_proveedor')
    .select('*, lineas_albaran_proveedor(*)')
    .eq('empresa_id', empresaId)
    .eq('proveedor_id', proveedorId)
    .eq('estado', 'pendiente')
    .order('fecha_albaran', { ascending: true })
  return { data: data || [], error }
}

export const createAlbaranProveedor = async (albaran, lineas) => {
  const { data: alb, error: errAlb } = await supabase
    .from('albaranes_proveedor')
    .insert(albaran)
    .select()
    .single()
  if (errAlb) return { data: null, error: errAlb }

  const items = lineas.map((l, i) => ({ ...l, albaran_id: alb.id, orden: i }))
  const { error: errL } = await supabase.from('lineas_albaran_proveedor').insert(items)
  if (errL) return { data: null, error: errL }

  // La mercancía ya ha llegado físicamente, así que el stock se
  // suma ahora — no se espera a que llegue la factura.
  for (const l of lineas.filter(l => l.producto_id)) {
    await supabase.rpc('mover_stock', {
      p_producto_id: l.producto_id,
      p_delta: Number(l.cantidad),
      p_tipo: 'entrada',
      p_referencia_id: alb.id,
      p_referencia_tipo: 'albaran',
      p_notas: `Albarán ${albaran.numero || alb.id.slice(0, 8)}`,
    })
  }

  return { data: alb, error: null }
}

export const deleteAlbaranProveedor = async (id) => {
  const { error } = await supabase.from('albaranes_proveedor').delete().eq('id', id)
  return { error }
}

// Crea la factura de proveedor a partir de uno o varios albaranes ya
// recibidos: junta todas sus líneas, calcula los totales, crea la
// factura SIN volver a tocar el stock, y marca los albaranes usados
// como 'facturado' para que dejen de aparecer como pendientes.
export const crearFacturaDesdeAlbaranes = async (factura, albaranes) => {
  const todasLineas = albaranes.flatMap(a =>
    (a.lineas_albaran_proveedor || []).map(l => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      iva_tasa: l.iva_tasa,
      subtotal: l.subtotal,
      producto_id: l.producto_id,
    }))
  )

  const { data: fp, error: errFp } = await supabase
    .from('facturas_proveedor')
    .insert(factura)
    .select()
    .single()
  if (errFp) return { data: null, error: errFp }

  const items = todasLineas.map((l, i) => ({ ...l, factura_id: fp.id, orden: i }))
  const { error: errL } = await supabase.from('lineas_factura_proveedor').insert(items)
  if (errL) return { data: null, error: errL }

  const idsAlbaranes = albaranes.map(a => a.id)
  const { error: errUpd } = await supabase
    .from('albaranes_proveedor')
    .update({ estado: 'facturado', factura_id: fp.id })
    .in('id', idsAlbaranes)
  if (errUpd) return { data: null, error: errUpd }

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
    await supabase.rpc('mover_stock', {
      p_producto_id: c.producto_id,
      p_delta: Number(c.cantidad), // devolver lo que se descontó
      p_tipo: 'ajuste_positivo',
      p_referencia_id: facturaId,
      p_referencia_tipo: 'factura',
      p_notas: 'Reversión por edición de factura',
    })
  }

  // 3. Borrar conceptos viejos e insertar nuevos
  await supabase.from('conceptos_factura').delete().eq('factura_id', facturaId)
  const items = conceptosNuevos.map((c, i) => ({ ...c, factura_id: facturaId, orden: i }))
  const { error: errConc } = await supabase.from('conceptos_factura').insert(items)
  if (errConc) return { error: errConc }

  // 4. Descontar stock de los nuevos conceptos con producto
  for (const c of conceptosNuevos.filter(c => c.producto_id)) {
    await supabase.rpc('mover_stock', {
      p_producto_id: c.producto_id,
      p_delta: -Number(c.cantidad),
      p_tipo: 'salida_factura',
      p_referencia_id: facturaId,
      p_referencia_tipo: 'factura',
      p_notas: 'Edición de factura',
    })
  }

  return { error: null }
}

// ── Verificación pública de facturas (para /verificar) ─
export const verificarFactura = async ({ folio, nif, total, fecha }) => {
  const { data, error } = await supabase.rpc('verificar_factura', {
    p_folio: folio,
    p_nif:   nif,
    p_total: total,
    p_fecha: fecha,
  })
  if (error) return { data: null, error }
  return { data: data?.[0] || null, error: null }
}

// ── Envío de email ─────────────────────────────────────
export const enviarEmail = async ({ to, subject, html, fromName }) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ to, subject, html, fromName }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Error al enviar' }
    return { ok: true }
  } catch (err) {
    return { error: err.message }
  }
}
