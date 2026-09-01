import { createClient } from '@supabase/supabase-js'
import {
  ESTADOS_COMPRA_CON_STOCK,
  ESTADOS_VENTA_CON_STOCK,
  calculateProductDeltas,
  compraDeltaFromEdit,
  deltaRef,
  getLineaRef,
  registrarMovimientoStock,
  revertirMovimientosDocumento,
  shouldApplyFacturaProveedorDirectStock,
  ventaDeltaFromEdit,
} from './stockMovements'
import {
  actualizarAlbaranProveedorAtomico,
  actualizarEstadoFacturaAtomico,
  actualizarEstadoFacturaProveedorAtomico,
  actualizarFacturaAtomica,
  actualizarFacturaProveedorAtomica,
  aplicarEntradaFacturaProveedorAtomica,
  crearAlbaranProveedorAtomico,
  crearFacturaAtomica,
  crearFacturaDesdeAlbaranesAtomica,
  crearFacturaProveedorAtomica,
  crearTicketAtomico,
  eliminarAlbaranProveedorAtomico,
  eliminarFacturaAtomica,
  eliminarFacturaProveedorAtomica,
  eliminarTicketsAtomico,
} from './atomicDocuments'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Faltan variables de entorno de Supabase. Crea un archivo .env basado en .env.example')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export const tasaRE = (ivaTasa) => {
  const t = Number(ivaTasa)
  if (t === 21) return 5.2
  if (t === 10) return 1.4
  if (t === 4)  return 0.5
  return 0
}

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password })

export const signOut = () =>
  supabase.auth.signOut()

export const getUser = () =>
  supabase.auth.getUser()

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

export const parseFolioNum = (folio) =>
  parseInt((folio || '').replace(/\D/g, '')) || 0

export const getFacturas = async (empresaId) => {
  const { data, error } = await supabase
    .from('facturas')
    .select(`*, clientes(nombre, email)`)
    .eq('empresa_id', empresaId)
    .order('fecha_emision', { ascending: false })
    .order('creado_en',     { ascending: false })
  const sorted = (data || []).sort((a, b) => {
    const diff = parseFolioNum(b.folio) - parseFolioNum(a.folio)
    if (diff !== 0) return diff
    // secondary: date descending
    return (b.fecha_emision || '') < (a.fecha_emision || '') ? -1 : 1
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
  let folioNormalizado = typeof factura?.folio === 'string' ? factura.folio.trim() : ''

  if (!folioNormalizado && factura?.empresa_id) {
    const { folio: folioReservado, error: errFolio } = await getSiguienteFolioAtomico(factura.empresa_id)
    if (errFolio) {
      return { data: null, error: new Error('No se pudo asignar el folio de la factura: ' + (errFolio.message || 'Error desconocido')) }
    }
    folioNormalizado = typeof folioReservado === 'string' ? folioReservado.trim() : ''
  }

  if (!folioNormalizado) {
    return { data: null, error: new Error('Folio vacío. No se pudo asignar un número de factura válido.') }
  }

  const facturaAInsertar = { ...factura, folio: folioNormalizado }
  return crearFacturaAtomica(
    supabase,
    facturaAInsertar,
    (conceptos || []).map((c, i) => ({ ...c, orden: i }))
  )
}

export const getSiguienteFolioAtomico = async (empresaId) => {
  if (!empresaId) return { folio: null, error: new Error('Falta el id de empresa para reservar el folio') }

  const { data, error } = await supabase.rpc('siguiente_folio_atomico', { p_empresa_id: empresaId })
  if (!error && data !== null && data !== undefined) {
    const folioValue = Array.isArray(data) && data.length === 1 ? data[0] : data
    if (folioValue !== null && folioValue !== undefined && folioValue !== '') {
      return { folio: folioValue, error: null }
    }
  }

  const { data: empresa, error: errEmpresa } = await supabase
    .from('empresas')
    .select('id, serie, siguiente_folio')
    .eq('id', empresaId)
    .single()

  if (errEmpresa || !empresa) {
    return { folio: null, error: error || errEmpresa || new Error('No se pudo obtener la empresa para el folio') }
  }

  // Compute the real max folio number from existing invoices so legacy
  // folios like FAC--0079 are taken into account, avoiding collisions.
  const { data: facturasExistentes } = await supabase
    .from('facturas')
    .select('folio')
    .eq('empresa_id', empresaId)

  const maxExistente = (facturasExistentes || []).reduce((max, f) => {
    const n = parseFolioNum(f.folio)
    return n > max ? n : max
  }, 0)

  const siguienteNumero = Math.max(maxExistente + 1, Number(empresa.siguiente_folio ?? 1))
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
  return actualizarEstadoFacturaAtomico(supabase, id, estado)
}

export const deleteFactura = async (id) => {
  const { error } = await eliminarFacturaAtomica(supabase, id)
  return { error }
}

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

export const descontarStockVenta = async (empresaId, lineas, referenciaId, referenciaTipo) => {
  const lineasConProducto = (lineas || []).filter(l => l?.producto_id && Number(l.cantidad) > 0)
  if (!lineasConProducto.length) return { error: null }

  for (let i = 0; i < lineasConProducto.length; i++) {
    const linea = lineasConProducto[i]
    const movimiento = await registrarMovimientoStock({
      supabase,
      empresaId,
      productoId: linea.producto_id,
      tipo: referenciaTipo === 'ticket' ? 'salida_ticket' : 'salida_factura',
      cantidad: -Number(linea.cantidad),
      referenciaTipo,
      referenciaId,
      referenciaLinea: getLineaRef(linea, i, `${referenciaTipo}-linea`),
      notas: referenciaTipo === 'ticket' ? 'Salida por ticket' : 'Salida por factura',
      permitirStockNegativo: false,
    })
    if (movimiento.error) return { error: movimiento.error }
  }
  return { error: null }
}

export const entradaStock = async (empresaId, productoId, cantidad, notas = '', options = {}) => {
  const movimiento = await registrarMovimientoStock({
    supabase,
    empresaId,
    productoId,
    tipo: 'entrada',
    cantidad: Number(cantidad),
    referenciaTipo: options.referenciaTipo || 'manual',
    referenciaId: options.referenciaId ?? null,
    referenciaLinea: options.referenciaLinea || '',
    notas: notas || 'Entrada manual',
    permitirStockNegativo: false,
  })
  if (movimiento.error) return { error: movimiento.error }
  return { error: null }
}

export const ajusteStock = async (empresaId, productoId, nuevoStock, notas = '') => {
  const { error } = await supabase.rpc('ajustar_stock_manual', {
    p_empresa_id: empresaId,
    p_producto_id: productoId,
    p_nuevo_stock: Number(nuevoStock),
    p_notas: notas || 'Ajuste manual',
  })
  if (error) return { error }
  return { error: null }
}

export const getFacturasProveedor = async (empresaId) => {
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .select('*, proveedores(nombre), vencimientos_factura_proveedor(*)')
    .eq('empresa_id', empresaId)
    .order('fecha_factura', { ascending: false })
  return { data: data || [], error }
}

export const getFacturaProveedor = async (id) => {
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .select('*, proveedores(*), lineas_factura_proveedor(*), vencimientos_factura_proveedor(*)')
    .eq('id', id)
    .single()
  return { data, error }
}

export const createFacturaProveedor = async (factura, lineas, vencimientos = []) => {
  return crearFacturaProveedorAtomica(
    supabase,
    factura,
    (lineas || []).map((l, i) => ({ ...l, orden: i })),
    vencimientos
  )
}

export const updateEstadoFacturaProveedor = async (id, estado) => {
  return actualizarEstadoFacturaProveedorAtomico(supabase, id, estado)
}

export const deleteFacturaProveedor = async (id) => {
  const { error } = await eliminarFacturaProveedorAtomica(supabase, id)
  return { error }
}

export const updateFacturaProveedor = async (facturaId, empresaId, cabecera, lineasNuevas, vencimientos = []) => {
  const { error } = await actualizarFacturaProveedorAtomica(
    supabase,
    facturaId,
    { ...cabecera, empresa_id: empresaId },
    (lineasNuevas || []).map((l, i) => ({ ...l, orden: i })),
    vencimientos
  )
  return { error }
}

export const RE_TASAS = { 21: 5.2, 10: 1.4, 4: 0.5, 0: 0 }

export const calcRecargoLinea = (base, ivaTasa) => {
  const reTasa = RE_TASAS[Number(ivaTasa)] ?? 0
  return +(base * reTasa / 100).toFixed(2)
}

export const updateFacturaCompleta = async (facturaId, empresaId, cabecera, conceptosNuevos, conceptosOriginales) => {
  const { error } = await actualizarFacturaAtomica(
    supabase,
    facturaId,
    { ...cabecera, empresa_id: empresaId },
    (conceptosNuevos || []).map((c, i) => ({ ...c, orden: i }))
  )
  return { error }
}

export const getAlbaranesProveedor = async (empresaId) => {
  const { data, error } = await supabase
    .from('albaranes_proveedor')
    .select('*, proveedores(nombre), lineas_albaran_proveedor(*)')
    .eq('empresa_id', empresaId)
    .order('fecha_albaran', { ascending: false })
  return { data: data || [], error }
}

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
  return crearAlbaranProveedorAtomico(
    supabase,
    albaran,
    (lineas || []).map((l, i) => ({ ...l, orden: i }))
  )
}

export const updateAlbaranProveedor = async (albaranId, cabecera, lineasNuevas, lineasOriginales) => {
  const { error } = await actualizarAlbaranProveedorAtomico(
    supabase,
    albaranId,
    cabecera,
    (lineasNuevas || []).map((l, i) => ({ ...l, orden: i }))
  )
  return { error }
}

export const deleteAlbaranProveedor = async (id) => {
  const { error } = await eliminarAlbaranProveedorAtomico(supabase, id)
  return { error }
}

export const crearFacturaDesdeAlbaranes = async (factura, lineas, albaranIds) => {
  return crearFacturaDesdeAlbaranesAtomica(
    supabase,
    factura,
    (lineas || []).map((l, i) => ({ ...l, orden: i })),
    albaranIds
  )
}

export const getFacturaProveedorStockPreview = async (facturaId) => {
  const { data: factura, error } = await supabase
    .from('facturas_proveedor')
    .select('id, empresa_id, numero, estado, lineas_factura_proveedor(*), albaranes_proveedor(id)')
    .eq('id', facturaId)
    .single()
  if (error) return { data: null, error }

  const lineasConProducto = (factura.lineas_factura_proveedor || [])
    .filter((l) => l.producto_id && Number(l.cantidad) > 0)
  const productoIds = [...new Set(lineasConProducto.map((l) => l.producto_id))]

  const [{ data: productos, error: errProductos }, { data: movimientosAplicados, error: errMovimientos }] = await Promise.all([
    productoIds.length
      ? supabase.from('productos').select('id, nombre, referencia, stock_actual, unidad').in('id', productoIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('movimientos_stock')
      .select('id, referencia_linea, producto_id, cantidad')
      .eq('empresa_id', factura.empresa_id)
      .eq('referencia_tipo', 'factura_proveedor')
      .eq('referencia_id', factura.id),
  ])
  if (errProductos) return { data: null, error: errProductos }
  if (errMovimientos) return { data: null, error: errMovimientos }

  const productosMap = new Map((productos || []).map((p) => [p.id, p]))
  const aplicadosMap = new Map(
    (movimientosAplicados || []).map((m) => [`${m.producto_id}:${m.referencia_linea || ''}`, m])
  )

  const previewLineas = lineasConProducto.map((linea, index) => {
    const refLinea = getLineaRef(linea, index, 'fp-linea')
    const prod = productosMap.get(linea.producto_id)
    const qty = Number(linea.cantidad) || 0
    const aplicado = !!aplicadosMap.get(`${linea.producto_id}:${refLinea}`)
    const stockAnterior = Number(prod?.stock_actual || 0)
    const stockPosterior = aplicado ? stockAnterior : stockAnterior + qty
    return {
      id: linea.id,
      referencia_linea: refLinea,
      producto_id: linea.producto_id,
      producto_nombre: prod?.nombre || linea.descripcion,
      producto_referencia: prod?.referencia || null,
      cantidad: qty,
      unidad: prod?.unidad || 'ud',
      stock_anterior: stockAnterior,
      stock_posterior: stockPosterior,
      ya_aplicada: aplicado,
    }
  })

  return {
    data: {
      factura_id: factura.id,
      empresa_id: factura.empresa_id,
      numero: factura.numero,
      estado: factura.estado,
      tiene_albaranes: (factura.albaranes_proveedor || []).length > 0,
      lineas: previewLineas,
      ya_aplicada_completa: previewLineas.length > 0 && previewLineas.every((l) => l.ya_aplicada),
    },
    error: null,
  }
}

export const aplicarEntradaStockFacturaProveedor = async (facturaId) => {
  return aplicarEntradaFacturaProveedorAtomica(supabase, facturaId)
}

export const deleteTicketsConStock = async (empresaId, ticketIds = []) => {
  const { error } = await eliminarTicketsAtomico(supabase, empresaId, ticketIds)
  return { error }
}

export const createTicket = async (ticket, lineas) =>
  crearTicketAtomico(
    supabase,
    ticket,
    (lineas || []).map((l, i) => ({ ...l, orden: i }))
  )

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

export const getProductosPorProveedor = async (proveedorId) => {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, referencia, categoria, precio_compra, precio_venta, multiplicador_venta, precio_venta_manual, activo')
    .eq('proveedor_id', proveedorId)
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true })
  return { data, error }
}

export const getCategoriasPorProveedor = async (proveedorId) => {
  const { data, error } = await supabase
    .from('productos')
    .select('categoria')
    .eq('proveedor_id', proveedorId)
    .not('categoria', 'is', null)
  if (error) return { data: [], error }
  const categorias = [...new Set(data.map(p => p.categoria).filter(Boolean))]
  return { data: categorias, error: null }
}

export const actualizarProveedor = async (proveedorId, campos) => {
  const { data, error } = await supabase
    .from('proveedores')
    .update(campos)
    .eq('id', proveedorId)
    .select()
    .single()
  return { data, error }
}

export const previsualizarPreciosProveedor = ({ productos, coeficiente, respetarCoeficienteProducto }) => {
  return productos.map(p => {
    const compra = Number(p.precio_compra) || 0
    const coefAplicado = respetarCoeficienteProducto && p.multiplicador_venta
      ? Number(p.multiplicador_venta)
      : Number(coeficiente)
    const nuevoPrecio = Math.round(compra * coefAplicado * 100) / 100
    return {
      ...p,
      coeficiente_aplicado: coefAplicado,
      precio_venta_actual: Number(p.precio_venta) || 0,
      precio_venta_propuesto: nuevoPrecio,
      diferencia: Math.round((nuevoPrecio - (Number(p.precio_venta) || 0)) * 100) / 100
    }
  })
}

export const aplicarPreciosMasivos = async ({ productosIds, coeficiente, forzarCoeficienteEnProducto }) => {
  const resultados = []
  for (const producto of productosIds) {
    const compra = Number(producto.precio_compra) || 0
    const coefAplicado = producto.coeficiente_aplicado
    const nuevoPrecio = Math.round(compra * coefAplicado * 100) / 100

    const payload = { precio_venta: nuevoPrecio }
    if (forzarCoeficienteEnProducto) {
      payload.multiplicador_venta = coefAplicado
    }

    const { data, error } = await supabase
      .from('productos')
      .update(payload)
      .eq('id', producto.id)
      .select()
      .single()

    resultados.push({ id: producto.id, nombre: producto.nombre, data, error })
  }
  const errores = resultados.filter(r => r.error)
  return { resultados, error: errores.length > 0 ? errores : null }
}

// ── Alertas de stock ────────────────────────────────────────
export const getProductosBajoMinimo = async (empresaId) => {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, referencia, stock_actual, stock_minimo')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .gt('stock_minimo', 0)
    .order('stock_actual', { ascending: true })
  if (error) return { data: [], error }
  const bajos = (data || []).filter(p => Number(p.stock_actual) <= Number(p.stock_minimo))
  return { data: bajos, error: null }
}

// ── Vencimientos de facturas de proveedor ────────────────────
export const getVencimientosFacturaProveedor = async (facturaId) => {
  const { data, error } = await supabase
    .from('vencimientos_factura_proveedor')
    .select('*')
    .eq('factura_id', facturaId)
    .order('fecha', { ascending: true })
  return { data: data || [], error }
}

export const getProximosVencimientosProveedor = async (empresaId) => {
  const { data, error } = await supabase
    .from('vencimientos_factura_proveedor')
    .select('*, facturas_proveedor(numero, proveedor_id, proveedores(nombre))')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: true })
  return { data: data || [], error }
}

export const marcarVencimientoPagado = async (id, pagado) => {
  const { data, error } = await supabase
    .from('vencimientos_factura_proveedor')
    .update({ pagado })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ── Duplicar factura ──────────────────────────────────────
export const duplicarFactura = async (facturaId) => {
  const { data: original, error: errGet } = await getFactura(facturaId)
  if (errGet || !original) return { data: null, error: errGet || new Error('Factura original no encontrada') }

  const nuevaFactura = {
    empresa_id: original.empresa_id,
    cliente_id: original.cliente_id,
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: null,
    estado: 'borrador',
    notas: original.notas || null,
    recargo_equivalencia: original.recargo_equivalencia || false,
    cp: original.cp || null,
  }

  const conceptosOriginales = (original.conceptos_factura || []).sort((a, b) => a.orden - b.orden)
  const conceptosNuevos = conceptosOriginales.map(c => ({
    descripcion: c.descripcion,
    cantidad: c.cantidad,
    precio_unitario: c.precio_unitario,
    iva_tasa: c.iva_tasa,
    descuento: c.descuento || 0,
    recargo_tasa: c.recargo_tasa || 0,
    recargo_importe: c.recargo_importe || 0,
    subtotal: c.subtotal,
    producto_id: c.producto_id || null,
  }))

  const { data: fact, error } = await createFactura(nuevaFactura, conceptosNuevos)
  return { data: fact, error }
}
