import { describe, it, expect, vi } from 'vitest'
import {
  calculateProductDeltas,
  compraDeltaFromEdit,
  ventaDeltaFromEdit,
  registrarMovimientoStock,
  revertirMovimientosDocumento,
  shouldApplyFacturaProveedorDirectStock,
} from './stockMovements'

describe('stockMovements — compras y ventas', () => {
  it('compra directa +1 genera delta positivo de entrada', () => {
    const deltas = calculateProductDeltas([], [{ producto_id: 'p1', cantidad: 1 }], compraDeltaFromEdit)
    expect(deltas).toEqual([{ producto_id: 'p1', cantidadAntes: 0, cantidadDespues: 1, delta: 1 }])
  })

  it('albarán +1 usa la misma lógica de entrada', () => {
    const deltas = calculateProductDeltas([{ producto_id: 'p1', cantidad: 2 }], [{ producto_id: 'p1', cantidad: 3 }], compraDeltaFromEdit)
    expect(deltas[0].delta).toBe(1)
  })

  it('factura desde albaranes no debe aplicar entrada directa', () => {
    expect(shouldApplyFacturaProveedorDirectStock({ estado: 'pendiente', tieneAlbaranes: true })).toBe(false)
    expect(shouldApplyFacturaProveedorDirectStock({ estado: 'pendiente', tieneAlbaranes: false })).toBe(true)
  })

  it('edición calcula delta por producto (compras)', () => {
    const deltas = calculateProductDeltas(
      [{ producto_id: 'p1', cantidad: 5 }, { producto_id: 'p2', cantidad: 1 }],
      [{ producto_id: 'p1', cantidad: 3 }, { producto_id: 'p2', cantidad: 4 }],
      compraDeltaFromEdit
    )
    expect(deltas).toEqual([
      { producto_id: 'p1', cantidadAntes: 5, cantidadDespues: 3, delta: -2 },
      { producto_id: 'p2', cantidadAntes: 1, cantidadDespues: 4, delta: 3 },
    ])
  })

  it('factura cliente -1 en emisión/confirmación', () => {
    const deltas = calculateProductDeltas([], [{ producto_id: 'p1', cantidad: 1 }], ventaDeltaFromEdit)
    expect(deltas[0].delta).toBe(-1)
  })

  it('ticket -1 usa la misma regla de venta', () => {
    const deltas = calculateProductDeltas([{ producto_id: 'p1', cantidad: 1 }], [{ producto_id: 'p1', cantidad: 2 }], ventaDeltaFromEdit)
    expect(deltas[0].delta).toBe(-1)
  })

  it('edición/anulación de venta revierte diferencia (delta positivo)', () => {
    const deltas = calculateProductDeltas([{ producto_id: 'p1', cantidad: 4 }], [{ producto_id: 'p1', cantidad: 1 }], ventaDeltaFromEdit)
    expect(deltas[0].delta).toBe(3)
  })
})

describe('stockMovements — idempotencia y validaciones RPC', () => {
  it('registra respuesta idempotente (aplicado=false) sin error', async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: [{ aplicado: false, movimiento_id: 'm1' }], error: null })),
    }
    const res = await registrarMovimientoStock({
      supabase,
      empresaId: 'e1',
      productoId: 'p1',
      tipo: 'entrada',
      cantidad: 1,
      referenciaTipo: 'factura_proveedor',
      referenciaId: 'f1',
      referenciaLinea: 'l1',
    })
    expect(res.error).toBeNull()
    expect(res.aplicado).toBe(false)
  })

  it('rechaza stock negativo cuando el RPC devuelve error', async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: { message: 'Stock insuficiente' } })),
    }
    const res = await registrarMovimientoStock({
      supabase,
      empresaId: 'e1',
      productoId: 'p1',
      tipo: 'salida_factura',
      cantidad: -3,
      referenciaTipo: 'factura',
      referenciaId: 'f1',
      referenciaLinea: 'l1',
    })
    expect(res.error?.message).toContain('Stock insuficiente')
  })

  it('anulación reversa crea movimiento inverso por saldo neto', async () => {
    const rpc = vi.fn(async () => ({ data: [{ aplicado: true, movimiento_id: 'm2' }], error: null }))
    const supabase = {
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  { producto_id: 'p1', cantidad: 2 },
                  { producto_id: 'p1', cantidad: 1 },
                ],
                error: null,
              })),
            })),
          })),
        })),
      })),
    }

    const res = await revertirMovimientosDocumento({
      supabase,
      empresaId: 'e1',
      referenciaId: 'doc-1',
      referenciaTiposOrigen: ['factura_proveedor'],
      referenciaTipoReversion: 'factura_proveedor_del',
      notas: 'test',
    })

    expect(res.error).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][1].p_cantidad).toBe(-3)
  })
})
