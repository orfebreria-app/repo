import { createClient } from '@supabase/supabase-js'

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

export const getFacturas = async (empresaId) => {
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

  const { data: fact, error: errFact } = await supabase
    .from('facturas')
    .insert(facturaAInsertar)
    .select()
    .single()
  if (errFact) return { data: null, error: errFact }

  const items = conceptos.map((c, i) => ({ ...c, factura_id: fact.id, orden: i }))
  const { error: errConc } = await supabase.from('conceptos_factura').insert(items)
  if (errConc) return { data: null, error: errConc }

  return { data: fact, error: null }
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
  const lineasConProducto = lineas.filter(l => l.producto_id)
  if (!lineasConProducto.length) return { error: null }

  for (const linea of lineasConProducto) {
    const { data: prod } = await supabase
      .from('productos')
      .select('stock_actual')
      .eq('id', linea.producto_id)
      .single()

    if (!prod) continue
    const anterior = Number(prod.stock_actual)
    const cantidad = Number(linea.cantidad)
    const posterior = anterior - cantidad

    await supabase
      .from('productos')
      .update({ stock_actual: posterior })
      .eq('id', linea.producto_id)

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

export const RE_TASAS = { 21: 5.2, 10: 1.4, 4: 0.5, 0: 0 }

export const calcRecargoLinea = (base, ivaTasa) => {
  const reTasa = RE_TASAS[Number(ivaTasa)] ?? 0
  return +(base * reTasa / 100).toFixed(2)
}

export const updateFacturaCompleta = async (facturaId, empresaId, cabecera, conceptosNuevos, conceptosOriginales) => {
  const { error: errCab } = await supabase
    .from('facturas')
    .update(cabecera)
    .eq('id', facturaId)
  if (errCab) return { error: errCab }

  for (const c of (conceptosOriginales || []).filter(c => c.producto_id)) {
    const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', c.producto_id).single()
    if (!prod) continue
    const anterior  = Number(prod.stock_actual)
    const posterior = anterior + Number(c.cantidad)
    await supabase.from('productos').update({ stock_actual: posterior }).eq('id', c.producto_id)
    await supabase.from('movimientos_stock').insert({
      empresa_id: empresaId, producto_id: c.producto_id,
      tipo: 'ajuste_positivo', cantidad: Number(c.cantidad),
      stock_anterior: anterior, stock_posterior: posterior,
      referencia_id: facturaId, referencia_tipo: 'factura',
      notas: 'Reversión por edición de factura',
    })
  }

  await supabase.from('conceptos_factura').delete().eq('factura_id', facturaId)
  const items = conceptosNuevos.map((c, i) => ({ ...c, factura_id: facturaId, orden: i }))
  const { error: errConc } = await supabase.from('conceptos_factura').insert(items)
  if (errConc) return { error: errConc }

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
  const { data: alb, error: errAlb } = await supabase
    .from('albaranes_proveedor')
    .insert(albaran)
    .select()
    .single()
  if (errAlb) return { data: null, error: errAlb }

  const items = lineas.map((l, i) => ({ ...l, albaran_id: alb.id, orden: i }))
  const { error: errL } = await supabase.from('lineas_albaran_proveedor').insert(items)
  if (errL) return { data: null, error: errL }

  for (const l of lineas.filter(l => l.producto_id && Number(l.cantidad) > 0)) {
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

export const updateAlbaranProveedor = async (albaranId, cabecera, lineasNuevas, lineasOriginales) => {
  const idsOriginalesUsados = new Set()

  for (const nueva of lineasNuevas) {
    if (!nueva.producto_id) continue
    const original = nueva._id_original
      ? lineasOriginales.find(o => o.id === nueva._id_original)
      : null
    if (original) idsOriginalesUsados.add(original.id)

    const cantidadNueva = Number(nueva.cantidad) || 0
    const cantidadAntigua = original ? Number(original.cantidad) || 0 : 0
    const delta = cantidadNueva - cantidadAntigua

    if (delta !== 0) {
      await supabase.rpc('mover_stock', {
        p_producto_id: nueva.producto_id,
        p_delta: delta,
        p_tipo: delta > 0 ? 'entrada' : 'ajuste_negativo',
        p_referencia_id: albaranId,
        p_referencia_tipo: 'albaran_edicion',
        p_notas: `Edición de albarán ${cabecera.numero || albaranId.slice(0, 8)}`,
      })
    }
  }

  for (const original of lineasOriginales) {
    if (!original.producto_id) continue
    if (idsOriginalesUsados.has(original.id)) continue
    const cantidadAntigua = Number(original.cantidad) || 0
    if (cantidadAntigua === 0) continue

    await supabase.rpc('mover_stock', {
      p_producto_id: original.producto_id,
      p_delta: -cantidadAntigua,
      p_tipo: 'ajuste_negativo',
      p_referencia_id: albaranId,
      p_referencia_tipo: 'albaran_edicion',
      p_notas: `Línea eliminada al editar albarán ${cabecera.numero || albaranId.slice(0, 8)}`,
    })
  }

  const { error: errDel } = await supabase.from('lineas_albaran_proveedor').delete().eq('albaran_id', albaranId)
  if (errDel) return { error: errDel }

  const items = lineasNuevas.map((l, i) => ({
    albaran_id: albaranId,
    descripcion: l.descripcion,
    referencia: l.referencia || null,
    cantidad: Number(l.cantidad) || 0,
    precio_unitario: Number(l.precio_unitario) || 0,
    iva_tasa: Number(l.iva_tasa) || 0,
    recargo_tasa: l.recargo_tasa || 0,
    recargo_importe: l.recargo_importe || 0,
    subtotal: l.subtotal || 0,
    producto_id: l.producto_id || null,
    orden: i,
  }))
  const { error: errIns } = await supabase.from('lineas_albaran_proveedor').insert(items)
  if (errIns) return { error: errIns }

  const { error: errCab } = await supabase
    .from('albaranes_proveedor')
    .update(cabecera)
    .eq('id', albaranId)
  if (errCab) return { error: errCab }

  return { error: null }
}

export const deleteAlbaranProveedor = async (id) => {
  const { error } = await supabase.from('albaranes_proveedor').delete().eq('id', id)
  return { error }
}

export const crearFacturaDesdeAlbaranes = async (factura, lineas, albaranIds) => {
  const { data: fp, error: errFp } = await supabase
    .from('facturas_proveedor')
    .insert(factura)
    .select()
    .single()
  if (errFp) return { data: null, error: errFp }

  const items = lineas.map((l, i) => ({ ...l, factura_id: fp.id, orden: i }))
  const { error: errL } = await supabase.from('lineas_factura_proveedor').insert(items)
  if (errL) return { data: null, error: errL }

  const { error: errUpd } = await supabase
    .from('albaranes_proveedor')
    .update({ estado: 'facturado', factura_id: fp.id })
    .in('id', albaranIds)
  if (errUpd) return { data: null, error: errUpd }

  return { data: fp, error: null }
}

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

// ── Alertas de stock ──────────────────────
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
