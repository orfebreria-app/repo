import { describe, it, expect } from 'vitest'
import { calcLinea, calcIvaLinea, calcRecargoLinea, calcularTotalesFactura, agruparPorIva, tasaRE } from './calculos'

describe('calcLinea', () => {
  it('multiplica cantidad por precio', () => {
    expect(calcLinea({ cantidad: 3, precio_unitario: 10 })).toBe(30)
  })

  it('aplica el descuento en porcentaje', () => {
    expect(calcLinea({ cantidad: 1, precio_unitario: 100, descuento: 10 })).toBe(90)
  })

  it('trata cantidades decimales correctamente', () => {
    expect(calcLinea({ cantidad: 2.5, precio_unitario: 4 })).toBe(10)
  })

  it('no rompe con precio vacío', () => {
    expect(calcLinea({ cantidad: 1, precio_unitario: '' })).toBe(0)
  })
})

describe('calcIvaLinea', () => {
  it('calcula el 21% correctamente', () => {
    expect(calcIvaLinea({ cantidad: 1, precio_unitario: 100, iva_tasa: 21 })).toBe(21)
  })

  it('calcula el 10% correctamente', () => {
    expect(calcIvaLinea({ cantidad: 1, precio_unitario: 100, iva_tasa: 10 })).toBe(10)
  })

  it('con IVA 0 no añade nada', () => {
    expect(calcIvaLinea({ cantidad: 1, precio_unitario: 100, iva_tasa: 0 })).toBe(0)
  })
})

describe('tasaRE / calcRecargoLinea', () => {
  it('mapea correctamente las tasas de recargo de equivalencia', () => {
    expect(tasaRE(21)).toBe(5.2)
    expect(tasaRE(10)).toBe(1.4)
    expect(tasaRE(4)).toBe(0.5)
    expect(tasaRE(0)).toBe(0)
  })

  it('calcula el recargo de una línea al 21%', () => {
    expect(calcRecargoLinea({ cantidad: 1, precio_unitario: 100, iva_tasa: 21 })).toBe(5.2)
  })
})

describe('agruparPorIva', () => {
  it('agrupa correctamente líneas con distintas tasas de IVA', () => {
    const lineas = [
      { subtotal: 100, iva_tasa: 21 },
      { subtotal: 50,  iva_tasa: 21 },
      { subtotal: 200, iva_tasa: 10 },
    ]
    const r = agruparPorIva(lineas)
    expect(r).toEqual([
      { tasa: 21, base: 150, cuota: 31.5, recargo: 0 },
      { tasa: 10, base: 200, cuota: 20,   recargo: 0 },
    ])
  })

  it('suma el recargo de equivalencia cuando existe', () => {
    const lineas = [{ subtotal: 100, iva_tasa: 21, recargo_importe: 5.2 }]
    const r = agruparPorIva(lineas)
    expect(r[0].recargo).toBe(5.2)
  })

  it('devuelve un array vacío sin líneas', () => {
    expect(agruparPorIva([])).toEqual([])
  })
})

describe('calcularTotalesFactura', () => {
  it('suma correctamente varias líneas con distintos tipos de IVA', () => {
    const lineas = [
      { cantidad: 1, precio_unitario: 100, iva_tasa: 21 }, // base 100, iva 21
      { cantidad: 2, precio_unitario: 50,  iva_tasa: 10 }, // base 100, iva 10
    ]
    const r = calcularTotalesFactura(lineas, false)
    expect(r.subtotal).toBe(200)
    expect(r.ivaTotal).toBe(31)
    expect(r.reTotal).toBe(0)
    expect(r.total).toBe(231)
  })

  it('añade el recargo de equivalencia cuando el cliente está sujeto a RE', () => {
    const lineas = [{ cantidad: 1, precio_unitario: 100, iva_tasa: 21 }]
    const r = calcularTotalesFactura(lineas, true)
    expect(r.subtotal).toBe(100)
    expect(r.ivaTotal).toBe(21)
    expect(r.reTotal).toBe(5.2)
    expect(r.total).toBe(126.2)
  })

  it('no añade recargo si el cliente no está sujeto a RE', () => {
    const lineas = [{ cantidad: 1, precio_unitario: 100, iva_tasa: 21 }]
    const r = calcularTotalesFactura(lineas, false)
    expect(r.reTotal).toBe(0)
    expect(r.total).toBe(121)
  })

  it('devuelve ceros con una factura sin líneas', () => {
    const r = calcularTotalesFactura([], false)
    expect(r).toEqual({ subtotal: 0, ivaTotal: 0, reTotal: 0, total: 0 })
  })

  it('redondea correctamente casos con decimales problemáticos', () => {
    // 3 unidades a 33.33€ con 21% de IVA — caso típico de redondeo
    const lineas = [{ cantidad: 3, precio_unitario: 33.33, iva_tasa: 21 }]
    const r = calcularTotalesFactura(lineas, false)
    expect(r.subtotal).toBe(99.99)
    expect(r.ivaTotal).toBe(21)
    expect(r.total).toBe(120.99)
  })
})
