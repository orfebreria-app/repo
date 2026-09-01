export const normalizeQuantity = (value) => {
  const qty = Number(value)
  if (!Number.isFinite(qty)) return 0
  return qty
}

export const getLineaRef = (linea, index, prefix = 'linea') => {
  const ref = linea?.id ?? linea?._id_original ?? linea?._id ?? `${prefix}-${index}`
  return String(ref)
}

export const aggregateByProduct = (lineas = []) => {
  const acumulado = new Map()
  lineas.forEach((linea) => {
    if (!linea?.producto_id) return
    const qty = normalizeQuantity(linea.cantidad)
    if (!qty) return
    acumulado.set(linea.producto_id, (acumulado.get(linea.producto_id) || 0) + qty)
  })
  return acumulado
}

export const calculateProductDeltas = (lineasAntes = [], lineasDespues = [], toStockDelta) => {
  const antes = aggregateByProduct(lineasAntes)
  const despues = aggregateByProduct(lineasDespues)
  const productoIds = new Set([...antes.keys(), ...despues.keys()])
  const deltas = []

  for (const productoId of productoIds) {
    const cantidadAntes = antes.get(productoId) || 0
    const cantidadDespues = despues.get(productoId) || 0
    const delta = toStockDelta(cantidadAntes, cantidadDespues)
    if (!delta) continue
    deltas.push({ producto_id: productoId, cantidadAntes, cantidadDespues, delta })
  }

  return deltas
}

export const deltaRef = ({ scope, productoId, cantidadAntes, cantidadDespues }) =>
  `${scope}:${productoId}:${cantidadAntes}->${cantidadDespues}`

export const compraDeltaFromEdit = (cantidadAntes, cantidadDespues) => cantidadDespues - cantidadAntes
export const ventaDeltaFromEdit = (cantidadAntes, cantidadDespues) => cantidadAntes - cantidadDespues

export const buildStockPreviewLineas = ({ lineasConProducto = [], productos = [], movimientosAplicados = [] }) => {
  const productosMap = new Map((productos || []).map((p) => [p.id, p]))
  const aplicadosMap = new Map(
    (movimientosAplicados || []).map((m) => [`${m.producto_id}:${m.referencia_linea || ''}`, m])
  )
  const aplicadoPorProducto = new Map()

  ;(movimientosAplicados || []).forEach((m) => {
    if (!m?.producto_id) return
    const qty = Number(m.cantidad) || 0
    aplicadoPorProducto.set(m.producto_id, (aplicadoPorProducto.get(m.producto_id) || 0) + qty)
  })

  const stockSecuencial = new Map()
  ;(lineasConProducto || []).forEach((linea) => {
    const productoId = linea.producto_id
    if (!productoId || stockSecuencial.has(productoId)) return
    const stockActual = Number(productosMap.get(productoId)?.stock_actual || 0)
    const yaAplicado = Number(aplicadoPorProducto.get(productoId) || 0)
    stockSecuencial.set(productoId, stockActual - yaAplicado)
  })

  return (lineasConProducto || []).map((linea, index) => {
    const refLinea = getLineaRef(linea, index, 'fp-linea')
    const prod = productosMap.get(linea.producto_id)
    const qty = Number(linea.cantidad) || 0
    const aplicado = !!aplicadosMap.get(`${linea.producto_id}:${refLinea}`)
    const stockAnterior = Number(stockSecuencial.get(linea.producto_id) || 0)
    const stockPosterior = stockAnterior + qty
    stockSecuencial.set(linea.producto_id, stockPosterior)

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
}

export const ESTADOS_VENTA_CON_STOCK = new Set(['emitida', 'pagada', 'vencida'])
export const ESTADOS_COMPRA_CON_STOCK = new Set(['pendiente', 'pagada', 'vencida'])

export const shouldApplyFacturaProveedorDirectStock = ({ estado, tieneAlbaranes = false }) =>
  !tieneAlbaranes && ESTADOS_COMPRA_CON_STOCK.has(estado || 'pendiente')

export const REFERENCIA_TIPOS = {
  FACTURA: 'factura',
  FACTURA_EDICION: 'factura_edicion',
  FACTURA_REVERSION: 'factura_reversion',
  FACTURA_REVERSION_COMP: 'factura_reversion_compensacion',
  FACTURA_PROVEEDOR: 'factura_proveedor',
  FACTURA_PROVEEDOR_EDICION: 'factura_proveedor_edicion',
  FACTURA_PROVEEDOR_REVERSION: 'factura_proveedor_reversion',
  FACTURA_PROVEEDOR_REVERSION_COMP: 'factura_proveedor_reversion_compensacion',
  ALBARAN_PROVEEDOR: 'albaran_proveedor',
  ALBARAN_PROVEEDOR_EDICION: 'albaran_proveedor_edicion',
  ALBARAN_PROVEEDOR_REVERSION: 'albaran_proveedor_reversion',
  ALBARAN_PROVEEDOR_REVERSION_COMP: 'albaran_proveedor_reversion_compensacion',
  TICKET: 'ticket',
  TICKET_EDICION: 'ticket_edicion',
  TICKET_REVERSION: 'ticket_reversion',
  TICKET_REVERSION_COMP: 'ticket_reversion_compensacion',
}

export const REFERENCIA_TIPOS_LEGACY = {
  ALBARAN_PROVEEDOR_EDICION: 'albaran_proveedor_edit',
  FACTURA_ANULACION: 'factura_anulacion',
  FACTURA_BORRADO: 'factura_borrado',
  FACTURA_PROVEEDOR_CANCEL: 'factura_proveedor_cancel',
  FACTURA_PROVEEDOR_DEL: 'factura_proveedor_del',
  ALBARAN_PROVEEDOR_DEL: 'albaran_proveedor_del',
  TICKET_BORRADO: 'ticket_borrado',
}

export const ORIGENES_POR_FLUJO = {
  factura: [REFERENCIA_TIPOS.FACTURA, REFERENCIA_TIPOS.FACTURA_EDICION],
  factura_proveedor: [REFERENCIA_TIPOS.FACTURA_PROVEEDOR, REFERENCIA_TIPOS.FACTURA_PROVEEDOR_EDICION],
  albaran_proveedor: [
    REFERENCIA_TIPOS.ALBARAN_PROVEEDOR,
    REFERENCIA_TIPOS.ALBARAN_PROVEEDOR_EDICION,
    REFERENCIA_TIPOS_LEGACY.ALBARAN_PROVEEDOR_EDICION,
  ],
  ticket: [REFERENCIA_TIPOS.TICKET, REFERENCIA_TIPOS.TICKET_EDICION],
}

export const REVERSAS_LEGACY_POR_FLUJO = {
  factura: [REFERENCIA_TIPOS_LEGACY.FACTURA_ANULACION, REFERENCIA_TIPOS_LEGACY.FACTURA_BORRADO],
  factura_proveedor: [REFERENCIA_TIPOS_LEGACY.FACTURA_PROVEEDOR_CANCEL, REFERENCIA_TIPOS_LEGACY.FACTURA_PROVEEDOR_DEL],
  albaran_proveedor: [REFERENCIA_TIPOS_LEGACY.ALBARAN_PROVEEDOR_DEL],
  ticket: [REFERENCIA_TIPOS_LEGACY.TICKET_BORRADO],
}

const reverseTypeBySource = (sourceType) => {
  if (sourceType === 'salida_factura' || sourceType === 'salida_ticket' || sourceType === 'ajuste_negativo') {
    return 'ajuste_positivo'
  }
  if (sourceType === 'entrada' || sourceType === 'ajuste_positivo') {
    return 'ajuste_negativo'
  }
  return null
}

const pickRpcRow = (data) => Array.isArray(data) ? (data[0] || null) : (data || null)

export const registrarMovimientoStock = async ({
  supabase,
  empresaId,
  productoId,
  tipo,
  cantidad,
  referenciaTipo,
  referenciaId,
  referenciaLinea = '',
  notas = null,
  permitirStockNegativo = false,
}) => {
  const qty = normalizeQuantity(cantidad)
  if (!qty) return { aplicado: false, omitido: true, error: null }

  const { data, error } = await supabase.rpc('registrar_movimiento_stock', {
    p_empresa_id: empresaId,
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: qty,
    p_referencia_tipo: referenciaTipo,
    p_referencia_id: referenciaId,
    p_referencia_linea: referenciaLinea || '',
    p_notas: notas,
    p_permitir_stock_negativo: !!permitirStockNegativo,
  })

  if (error) return { aplicado: false, omitido: false, error }

  const row = pickRpcRow(data)
  return {
    aplicado: !!row?.aplicado,
    omitido: false,
    error: null,
    movimiento_id: row?.movimiento_id || null,
    stock_anterior: row?.stock_anterior ?? null,
    stock_posterior: row?.stock_posterior ?? null,
  }
}

export const revertirMovimientosDocumento = async ({
  supabase,
  empresaId,
  referenciaId,
  referenciaTiposOrigen,
  referenciaTipoReversion,
  referenciaTiposReversionCompat = [],
  notas,
  permitirStockNegativo = false,
}) => {
  if (referenciaTiposReversionCompat.length > 0) {
    const { data: legacyReversiones, error: errLegacy } = await supabase
      .from('movimientos_stock')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('referencia_id', referenciaId)
      .in('referencia_tipo', referenciaTiposReversionCompat)
      .limit(1)
    if (errLegacy) return { error: errLegacy }
    if ((legacyReversiones || []).length > 0) return { error: null, omitido: true }
  }

  const { data, error } = await supabase
    .from('movimientos_stock')
    .select('id, producto_id, tipo, cantidad')
    .eq('empresa_id', empresaId)
    .eq('referencia_id', referenciaId)
    .in('referencia_tipo', referenciaTiposOrigen)

  if (error) return { error }
  for (const mov of (data || [])) {
    if (!mov?.id || !mov?.producto_id) continue
    const cantidadOrigen = normalizeQuantity(mov.cantidad)
    if (!cantidadOrigen) continue
    const cantidadReversa = -cantidadOrigen
    const tipo = reverseTypeBySource(mov.tipo) || (cantidadReversa >= 0 ? 'ajuste_positivo' : 'ajuste_negativo')
    const movimiento = await registrarMovimientoStock({
      supabase,
      empresaId,
      productoId: mov.producto_id,
      tipo,
      cantidad: cantidadReversa,
      referenciaTipo: referenciaTipoReversion,
      referenciaId,
      referenciaLinea: `reversion:${mov.id}`,
      notas,
      permitirStockNegativo,
    })
    if (movimiento.error) return { error: movimiento.error }
  }

  return { error: null }
}
