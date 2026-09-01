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

export const ESTADOS_VENTA_CON_STOCK = new Set(['emitida', 'pagada', 'vencida'])
export const ESTADOS_COMPRA_CON_STOCK = new Set(['pendiente', 'pagada', 'vencida'])

export const shouldApplyFacturaProveedorDirectStock = ({ estado, tieneAlbaranes = false }) =>
  !tieneAlbaranes && ESTADOS_COMPRA_CON_STOCK.has(estado || 'pendiente')

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
  notas,
  permitirStockNegativo = false,
}) => {
  const { data, error } = await supabase
    .from('movimientos_stock')
    .select('producto_id, cantidad')
    .eq('empresa_id', empresaId)
    .eq('referencia_id', referenciaId)
    .in('referencia_tipo', referenciaTiposOrigen)

  if (error) return { error }

  const saldo = new Map()
  ;(data || []).forEach((mov) => {
    if (!mov?.producto_id) return
    const qty = normalizeQuantity(mov.cantidad)
    if (!qty) return
    saldo.set(mov.producto_id, (saldo.get(mov.producto_id) || 0) + qty)
  })

  for (const [productoId, cantidadNeta] of saldo.entries()) {
    if (!cantidadNeta) continue
    const cantidadReversa = -cantidadNeta
    const tipo = cantidadReversa >= 0 ? 'ajuste_positivo' : 'ajuste_negativo'
    const movimiento = await registrarMovimientoStock({
      supabase,
      empresaId,
      productoId,
      tipo,
      cantidad: cantidadReversa,
      referenciaTipo: referenciaTipoReversion,
      referenciaId,
      referenciaLinea: `reversion:${productoId}`,
      notas,
      permitirStockNegativo,
    })
    if (movimiento.error) return { error: movimiento.error }
  }

  return { error: null }
}
