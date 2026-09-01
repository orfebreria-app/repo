const asJson = (value, fallback) => value ?? fallback

const pickRpcRow = (data) => Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
const ensureId = (record) => record?.id ? record : { ...record, id: globalThis.crypto?.randomUUID?.() }

const wrapRpcError = (message, fallbackMessage) => {
  const text = message || 'Error desconocido'
  if (/PGRST202|schema cache|Could not find the function|function .* does not exist/i.test(text)) {
    return new Error(`${fallbackMessage} Falta aplicar la migración SQL de atomicidad/RPC.`)
  }
  return new Error(text)
}

export const callAtomicRpc = async ({ supabase, fn, args, fallbackMessage }) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { data: null, error: wrapRpcError(error.message, fallbackMessage) }
  return { data: pickRpcRow(data), error: null }
}

export const crearFacturaAtomica = (supabase, factura, conceptos) =>
  callAtomicRpc({
    supabase,
    fn: 'crear_factura_cliente_atomica',
    args: {
      p_factura: asJson(ensureId(factura), {}),
      p_conceptos: asJson(conceptos, []),
    },
    fallbackMessage: 'No se pudo crear la factura de forma atómica.',
  })

export const actualizarEstadoFacturaAtomico = (supabase, facturaId, estado) =>
  callAtomicRpc({
    supabase,
    fn: 'actualizar_estado_factura_atomico',
    args: {
      p_factura_id: facturaId,
      p_estado: estado,
    },
    fallbackMessage: 'No se pudo actualizar el estado de la factura de forma atómica.',
  })

export const actualizarFacturaAtomica = (supabase, facturaId, cabecera, conceptosNuevos) =>
  callAtomicRpc({
    supabase,
    fn: 'actualizar_factura_cliente_atomica',
    args: {
      p_factura_id: facturaId,
      p_cabecera: asJson(cabecera, {}),
      p_conceptos_nuevos: asJson(conceptosNuevos, []),
    },
    fallbackMessage: 'No se pudo editar la factura de forma atómica.',
  })

export const eliminarFacturaAtomica = (supabase, facturaId) =>
  callAtomicRpc({
    supabase,
    fn: 'eliminar_factura_atomica',
    args: {
      p_factura_id: facturaId,
    },
    fallbackMessage: 'No se pudo eliminar la factura de forma atómica.',
  })

export const crearFacturaProveedorAtomica = (supabase, factura, lineas, vencimientos) =>
  callAtomicRpc({
    supabase,
    fn: 'crear_factura_proveedor_atomica',
    args: {
      p_factura: asJson(ensureId(factura), {}),
      p_lineas: asJson(lineas, []),
      p_vencimientos: asJson(vencimientos, []),
    },
    fallbackMessage: 'No se pudo crear la factura de proveedor de forma atómica.',
  })

export const actualizarEstadoFacturaProveedorAtomico = (supabase, facturaId, estado) =>
  callAtomicRpc({
    supabase,
    fn: 'actualizar_estado_factura_proveedor_atomico',
    args: {
      p_factura_id: facturaId,
      p_estado: estado,
    },
    fallbackMessage: 'No se pudo actualizar el estado de la factura de proveedor de forma atómica.',
  })

export const eliminarFacturaProveedorAtomica = (supabase, facturaId) =>
  callAtomicRpc({
    supabase,
    fn: 'eliminar_factura_proveedor_atomica',
    args: {
      p_factura_id: facturaId,
    },
    fallbackMessage: 'No se pudo eliminar la factura de proveedor de forma atómica.',
  })

export const actualizarFacturaProveedorAtomica = (supabase, facturaId, cabecera, lineasNuevas, vencimientos) =>
  callAtomicRpc({
    supabase,
    fn: 'actualizar_factura_proveedor_atomica',
    args: {
      p_factura_id: facturaId,
      p_cabecera: asJson(cabecera, {}),
      p_lineas_nuevas: asJson(lineasNuevas, []),
      p_vencimientos: asJson(vencimientos, []),
    },
    fallbackMessage: 'No se pudo editar la factura de proveedor de forma atómica.',
  })

export const crearAlbaranProveedorAtomico = (supabase, albaran, lineas) =>
  callAtomicRpc({
    supabase,
    fn: 'crear_albaran_proveedor_atomico',
    args: {
      p_albaran: asJson(ensureId(albaran), {}),
      p_lineas: asJson(lineas, []),
    },
    fallbackMessage: 'No se pudo crear el albarán de proveedor de forma atómica.',
  })

export const actualizarAlbaranProveedorAtomico = (supabase, albaranId, cabecera, lineasNuevas) =>
  callAtomicRpc({
    supabase,
    fn: 'actualizar_albaran_proveedor_atomico',
    args: {
      p_albaran_id: albaranId,
      p_cabecera: asJson(cabecera, {}),
      p_lineas_nuevas: asJson(lineasNuevas, []),
    },
    fallbackMessage: 'No se pudo editar el albarán de proveedor de forma atómica.',
  })

export const eliminarAlbaranProveedorAtomico = (supabase, albaranId) =>
  callAtomicRpc({
    supabase,
    fn: 'eliminar_albaran_proveedor_atomico',
    args: {
      p_albaran_id: albaranId,
    },
    fallbackMessage: 'No se pudo eliminar el albarán de proveedor de forma atómica.',
  })

export const crearFacturaDesdeAlbaranesAtomica = (supabase, factura, lineas, albaranIds) =>
  callAtomicRpc({
    supabase,
    fn: 'crear_factura_desde_albaranes_atomica',
    args: {
      p_factura: asJson(ensureId(factura), {}),
      p_lineas: asJson(lineas, []),
      p_albaran_ids: albaranIds || [],
    },
    fallbackMessage: 'No se pudo crear la factura desde albaranes de forma atómica.',
  })

export const aplicarEntradaFacturaProveedorAtomica = (supabase, facturaId) =>
  callAtomicRpc({
    supabase,
    fn: 'aplicar_entrada_stock_factura_proveedor_atomica',
    args: {
      p_factura_id: facturaId,
    },
    fallbackMessage: 'No se pudo aplicar la entrada de stock de la factura de proveedor de forma atómica.',
  })

export const crearTicketAtomico = (supabase, ticket, lineas) =>
  callAtomicRpc({
    supabase,
    fn: 'crear_ticket_atomico',
    args: {
      p_ticket: asJson(ensureId(ticket), {}),
      p_lineas: asJson(lineas, []),
    },
    fallbackMessage: 'No se pudo crear el ticket de forma atómica.',
  })

export const eliminarTicketsAtomico = (supabase, empresaId, ticketIds) =>
  callAtomicRpc({
    supabase,
    fn: 'eliminar_tickets_atomico',
    args: {
      p_empresa_id: empresaId,
      p_ticket_ids: ticketIds || [],
    },
    fallbackMessage: 'No se pudieron eliminar los tickets de forma atómica.',
  })
