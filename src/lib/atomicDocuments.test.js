import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  actualizarEstadoFacturaAtomico,
  callAtomicRpc,
  crearFacturaAtomica,
  crearFacturaDesdeAlbaranesAtomica,
  crearTicketAtomico,
  eliminarTicketsAtomico,
} from './atomicDocuments'

describe('atomicDocuments', () => {
  const rpc = vi.fn()
  const supabase = { rpc }
  let randomUuidSpy

  beforeEach(() => {
    rpc.mockReset()
    randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('uuid-123')
  })

  afterEach(() => {
    randomUuidSpy.mockRestore()
  })

  it('devuelve la primera fila del RPC cuando Supabase responde un array', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'f-1', folio: 'FAC-0001' }], error: null })
    const res = await callAtomicRpc({
      supabase,
      fn: 'crear_factura_cliente_atomica',
      args: {},
      fallbackMessage: 'fallback',
    })
    expect(res.error).toBeNull()
    expect(res.data).toEqual({ id: 'f-1', folio: 'FAC-0001' })
  })

  it('convierte un RPC ausente en mensaje claro de migración pendiente', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Could not find the function public.crear_ticket_atomico(p_ticket, p_lineas) in the schema cache' } })
    const res = await crearTicketAtomico(supabase, { empresa_id: 'e1', numero: 7 }, [])
    expect(res.error).toBeInstanceOf(Error)
    expect(res.error.message).toContain('migración SQL de atomicidad/RPC')
  })

  it('inyecta un id estable al crear factura para soportar reintentos idempotentes', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'uuid-123' }, error: null })
    await crearFacturaAtomica(supabase, { empresa_id: 'e1', folio: 'FAC-0007' }, [{ descripcion: 'x', cantidad: 1 }])
    expect(rpc).toHaveBeenCalledWith('crear_factura_cliente_atomica', {
      p_factura: { id: 'uuid-123', empresa_id: 'e1', folio: 'FAC-0007' },
      p_conceptos: [{ descripcion: 'x', cantidad: 1 }],
    })
  })

  it('usa el RPC específico para cambios de estado de factura cliente', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'f-1', estado: 'cancelada' }, error: null })
    await actualizarEstadoFacturaAtomico(supabase, 'f-1', 'cancelada')
    expect(rpc).toHaveBeenCalledWith('actualizar_estado_factura_atomico', {
      p_factura_id: 'f-1',
      p_estado: 'cancelada',
    })
  })

  it('preserva los ids de albarán al facturar desde albaranes sin stock directo', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'fp-1' }, error: null })
    await crearFacturaDesdeAlbaranesAtomica(
      supabase,
      { empresa_id: 'e1', proveedor_id: 'p1' },
      [{ descripcion: 'x', cantidad: 2, orden: 0 }],
      ['alb-1', 'alb-2']
    )
    expect(rpc).toHaveBeenCalledWith('crear_factura_desde_albaranes_atomica', {
      p_factura: { id: 'uuid-123', empresa_id: 'e1', proveedor_id: 'p1' },
      p_lineas: [{ descripcion: 'x', cantidad: 2, orden: 0 }],
      p_albaran_ids: ['alb-1', 'alb-2'],
    })
  })

  it('envía lote de tickets para borrado atómico', async () => {
    rpc.mockResolvedValueOnce({ data: { deleted: 2 }, error: null })
    await eliminarTicketsAtomico(supabase, 'e1', ['t1', 't2'])
    expect(rpc).toHaveBeenCalledWith('eliminar_tickets_atomico', {
      p_empresa_id: 'e1',
      p_ticket_ids: ['t1', 't2'],
    })
  })
})
