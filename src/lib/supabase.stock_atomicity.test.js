import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REFERENCIA_TIPOS, REFERENCIA_TIPOS_LEGACY } from './stockMovements'

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
    },
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('./stockMovements', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    registrarMovimientoStock: vi.fn(async () => ({ aplicado: true, error: null })),
    revertirMovimientosDocumento: vi.fn(async () => ({ error: null })),
  }
})

import { registrarMovimientoStock, revertirMovimientosDocumento } from './stockMovements'
import { updateAlbaranProveedor, updateEstadoFactura } from './supabase'

describe('supabase stock atomicidad/compensación', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('compensa stock de edición de albarán si falla la reescritura de líneas', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'lineas_albaran_proveedor') {
        return {
          delete: () => ({
            eq: async () => ({ error: { message: 'fallo-del-lineas' } }),
          }),
        }
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    const res = await updateAlbaranProveedor(
      'alb-1',
      { empresa_id: 'emp-1', numero: 'A-1' },
      [{ producto_id: 'p1', cantidad: 2 }],
      [{ producto_id: 'p1', cantidad: 1 }]
    )

    expect(res.error?.message).toContain('fallo-del-lineas')
    expect(registrarMovimientoStock).toHaveBeenCalledTimes(1)
    expect(revertirMovimientosDocumento).toHaveBeenCalledTimes(1)
    const payload = revertirMovimientosDocumento.mock.calls[0][0]
    expect(payload.referenciaTipoReversion).toBe(REFERENCIA_TIPOS.ALBARAN_PROVEEDOR_REVERSION_COMP)
    expect(payload.referenciaTiposOrigen).toContain(REFERENCIA_TIPOS.ALBARAN_PROVEEDOR_EDICION)
    expect(payload.referenciaTiposOrigen).toContain(REFERENCIA_TIPOS_LEGACY.ALBARAN_PROVEEDOR_EDICION)
  })

  it('revierte estado de factura si el stock falla después de actualizar estado', async () => {
    const updateCalls = []
    mockSupabase.from.mockImplementation((table) => {
      if (table !== 'facturas') return {}
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'f1',
                empresa_id: 'emp-1',
                estado: 'borrador',
                conceptos_factura: [{ producto_id: 'p1', cantidad: 1 }],
              },
              error: null,
            }),
          }),
        }),
        update: (payload) => {
          updateCalls.push(payload)
          return {
            eq: () => {
              if (payload.estado === 'emitida') {
                return {
                  select: () => ({
                    single: async () => ({ data: { id: 'f1', estado: 'emitida' }, error: null }),
                  }),
                }
              }
              return { error: null }
            },
          }
        },
      }
    })

    registrarMovimientoStock.mockImplementationOnce(async () => ({ aplicado: false, error: { message: 'stock insuficiente' } }))

    const res = await updateEstadoFactura('f1', 'emitida')

    expect(res.error?.message).toContain('stock insuficiente')
    expect(updateCalls).toEqual([{ estado: 'emitida' }, { estado: 'borrador' }])
  })
})
