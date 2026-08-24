// ============================================================
// AÑADIDO: Gestión avanzada de proveedores y precios masivos
// (Nuevas funciones - no reemplazan nada existente)
// ============================================================

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
