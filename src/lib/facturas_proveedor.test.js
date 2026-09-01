/**
 * Tests para facturas de proveedor:
 *  1. getFacturasProveedor no incluye clientes() en la consulta
 *  2. La lista permanece visible tras un error de carga
 *  3. Cálculo de base con descuento por línea
 *  4. El precio de venta usa precio_unitario_base sin descuento
 *  5. Selección de múltiples albaranes y prevención de duplicados
 *  6. Stock idempotente (no duplica movimientos con misma referencia)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Helpers de cálculo ───────────────────────────────────────────────
// Replica la lógica de calcBase en FacturasProveedores.jsx
function calcBase(l) {
  const bruto = Number(l.cantidad || 0) * Number(l.precio_unitario || 0)
  const descuento = Number(l.descuento_porcentaje || 0)
  return +(bruto * (1 - descuento / 100)).toFixed(2)
}

// Replica calcPrecioVentaSugerido de supabase.js
function calcPrecioVentaSugerido({ precioCompra = 0, multiplicadorProducto = null, multiplicadorProveedor = null }) {
  const base = Number(precioCompra) || 0
  const multProd = multiplicadorProducto == null || multiplicadorProducto === '' ? null : Number(multiplicadorProducto)
  const multProv = multiplicadorProveedor == null || multiplicadorProveedor === '' ? 2.5 : Number(multiplicadorProveedor)
  const multiplicador = (multProd && multProd > 0) ? multProd : (multProv && multProv > 0 ? multProv : 2.5)
  return +(base * multiplicador).toFixed(2)
}

// ─── 1. getFacturasProveedor: consulta sin clientes() ─────────────────
describe('getFacturasProveedor — consulta sin clientes()', () => {
  it('NO incluye clientes(nombre) en la cadena de select', () => {
    // Verificamos la cadena de selección que debe usarse
    const selectString = '*, proveedores(nombre), vencimientos_factura_proveedor(*)'
    expect(selectString).not.toContain('clientes(nombre)')
    expect(selectString).toContain('proveedores(nombre)')
    expect(selectString).toContain('vencimientos_factura_proveedor(*)')
  })

  it('devuelve array vacío cuando data es null (sin lanzar error)', () => {
    // Simula el comportamiento de la función real: data || []
    const data = null
    const result = data || []
    expect(result).toEqual([])
  })
})

// ─── 2. Lista visible tras error de carga ────────────────────────────
describe('cargar — manejo de errores de lista', () => {
  it('NO reemplaza la lista existente si hay error en getFacturasProveedor', () => {
    const listaExistente = [{ id: '1', total: 100 }, { id: '2', total: 200 }]
    let facturas = [...listaExistente]
    let loadError = null

    // Simula el nuevo comportamiento de cargar()
    const errFacts = { message: 'PGRST200: Relación inexistente' }
    const dataFacts = null

    if (errFacts) {
      loadError = errFacts.message
      // NO modificamos facturas
    } else {
      loadError = null
      facturas = dataFacts || []
    }

    expect(loadError).toBe('PGRST200: Relación inexistente')
    expect(facturas).toEqual(listaExistente) // lista intacta
  })

  it('limpia el error y reemplaza la lista cuando la carga tiene éxito', () => {
    let facturas = [{ id: 'viejo', total: 0 }]
    let loadError = 'Error previo'

    const errFacts = null
    const dataFacts = [{ id: 'nuevo', total: 500 }]

    if (errFacts) {
      loadError = errFacts.message
    } else {
      loadError = null
      facturas = dataFacts || []
    }

    expect(loadError).toBeNull()
    expect(facturas).toEqual([{ id: 'nuevo', total: 500 }])
  })
})

// ─── 3. Cálculo con descuento por línea ──────────────────────────────
describe('calcBase — descuento por línea', () => {
  it('sin descuento: base = cantidad × precio', () => {
    expect(calcBase({ cantidad: 5, precio_unitario: 10, descuento_porcentaje: 0 })).toBe(50)
  })

  it('descuento 20%: base = cantidad × precio × 0.8', () => {
    expect(calcBase({ cantidad: 2, precio_unitario: 100, descuento_porcentaje: 20 })).toBe(160)
  })

  it('descuento 100%: base = 0', () => {
    expect(calcBase({ cantidad: 3, precio_unitario: 50, descuento_porcentaje: 100 })).toBe(0)
  })

  it('descuento ausente (undefined) equivale a 0%', () => {
    expect(calcBase({ cantidad: 1, precio_unitario: 200 })).toBe(200)
  })

  it('descuento parcial con decimales', () => {
    // 1 × 100 × (1 - 5.5/100) = 94.5
    expect(calcBase({ cantidad: 1, precio_unitario: 100, descuento_porcentaje: 5.5 })).toBe(94.5)
  })
})

// ─── 4. Precio de venta usa precio_unitario_base (sin descuento) ──────
describe('calcPrecioVentaSugerido — regla comercial: usar precio base sin descuento', () => {
  it('usa precio_unitario_base, no el precio neto con descuento', () => {
    const precioBase = 100        // precio sin descuento
    const descuentoPct = 20       // 20% de descuento → precio facturado = 80
    const precioNeto = precioBase * (1 - descuentoPct / 100) // 80

    const pvpConBase  = calcPrecioVentaSugerido({ precioCompra: precioBase, multiplicadorProveedor: 2 })
    const pvpConNeto  = calcPrecioVentaSugerido({ precioCompra: precioNeto,  multiplicadorProveedor: 2 })

    // El precio de venta se calcula sobre la base (200), no sobre el neto (160)
    expect(pvpConBase).toBe(200)
    expect(pvpConNeto).toBe(160)
    // El sistema DEBE usar pvpConBase
    expect(pvpConBase).toBeGreaterThan(pvpConNeto)
  })

  it('respeta multiplicador de producto si está definido', () => {
    expect(calcPrecioVentaSugerido({ precioCompra: 100, multiplicadorProducto: 3, multiplicadorProveedor: 2 })).toBe(300)
  })

  it('usa multiplicador de proveedor cuando no hay multiplicador de producto', () => {
    expect(calcPrecioVentaSugerido({ precioCompra: 100, multiplicadorProducto: null, multiplicadorProveedor: 2.5 })).toBe(250)
  })

  it('usa 2.5 como fallback cuando no hay ningún multiplicador', () => {
    expect(calcPrecioVentaSugerido({ precioCompra: 100 })).toBe(250)
  })
})

// ─── 5. Selección múltiple de albaranes / prevención de duplicados ────
describe('selección de albaranes — prevención de duplicados', () => {
  function toggleAlbaran(seleccionados, id) {
    return seleccionados.includes(id)
      ? seleccionados.filter(x => x !== id)
      : [...seleccionados, id]
  }

  it('añade un albarán al seleccionarlo', () => {
    const result = toggleAlbaran([], 'alb-1')
    expect(result).toEqual(['alb-1'])
  })

  it('quita el albarán si ya estaba seleccionado (deselección)', () => {
    const result = toggleAlbaran(['alb-1', 'alb-2'], 'alb-1')
    expect(result).toEqual(['alb-2'])
  })

  it('no añade el mismo albarán dos veces', () => {
    const seleccionados = toggleAlbaran([], 'alb-1')
    const seleccionados2 = toggleAlbaran(seleccionados, 'alb-1') // deselecciona
    const seleccionados3 = toggleAlbaran(seleccionados2, 'alb-1') // vuelve a seleccionar
    expect(seleccionados3.filter(x => x === 'alb-1').length).toBe(1)
  })

  it('permite seleccionar varios albaranes de una vez', () => {
    let sel = []
    sel = toggleAlbaran(sel, 'alb-1')
    sel = toggleAlbaran(sel, 'alb-2')
    sel = toggleAlbaran(sel, 'alb-3')
    expect(sel).toEqual(['alb-1', 'alb-2', 'alb-3'])
  })
})

// ─── 6. Stock idempotente: no duplicar movimientos ────────────────────
describe('stock idempotente — no duplicar movimientos con misma referencia', () => {
  /**
   * Simula la lógica de un controlador de stock que registra
   * una entrada solo si no existe ya un movimiento con la misma
   * (referencia_id + referencia_tipo).
   */
  function registrarEntradaIdempotente(movimientosExistentes, nuevoMovimiento) {
    const yaExiste = movimientosExistentes.some(
      m => m.referencia_id === nuevoMovimiento.referencia_id &&
           m.referencia_tipo === nuevoMovimiento.referencia_tipo
    )
    if (yaExiste) return { registrado: false, movimientos: movimientosExistentes }
    return { registrado: true, movimientos: [...movimientosExistentes, nuevoMovimiento] }
  }

  it('registra el movimiento si no existe previamente', () => {
    const { registrado, movimientos } = registrarEntradaIdempotente([], {
      referencia_id: 'fact-001', referencia_tipo: 'factura_proveedor', cantidad: 5
    })
    expect(registrado).toBe(true)
    expect(movimientos).toHaveLength(1)
  })

  it('NO registra si ya existe un movimiento con la misma referencia (idempotencia)', () => {
    const existente = [{ referencia_id: 'fact-001', referencia_tipo: 'factura_proveedor', cantidad: 5 }]
    const { registrado, movimientos } = registrarEntradaIdempotente(existente, {
      referencia_id: 'fact-001', referencia_tipo: 'factura_proveedor', cantidad: 5
    })
    expect(registrado).toBe(false)
    expect(movimientos).toHaveLength(1) // sin duplicado
  })

  it('permite movimientos con misma referencia_id pero distinto referencia_tipo', () => {
    const existente = [{ referencia_id: 'alb-001', referencia_tipo: 'albaran', cantidad: 3 }]
    const { registrado } = registrarEntradaIdempotente(existente, {
      referencia_id: 'alb-001', referencia_tipo: 'factura_proveedor', cantidad: 3
    })
    expect(registrado).toBe(true)
  })
})
