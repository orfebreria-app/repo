import { beforeEach, describe, expect, it } from 'vitest'
import { createFactura, createSupabaseClient, construirFolioFactura, getEmpresa, getFacturas, isLocalDevMode, resolverFolioFactura } from './supabase'
import { buildVerificationUrl } from './verificacion'

describe('supabase local demo helpers', () => {
  beforeEach(() => {
    global.window = {
      localStorage: {
        clear: () => {},
        getItem: () => null,
        setItem: () => {},
      },
      history: {
        replaceState: () => {},
      },
      location: { hostname: 'localhost', href: 'http://localhost:5173/facturas' },
      dispatchEvent: () => true,
    }
  })

  it('creates a safe fallback client when Supabase env vars are missing', async () => {
    const client = createSupabaseClient('', '')

    expect(client.auth.getSession).toBeTypeOf('function')
    expect(client.from).toBeTypeOf('function')

    const sessionResult = await client.auth.getSession()
    expect(sessionResult.error).toBeNull()
  })

  it('returns a demo company in local demo mode so the dashboard and invoices can load', async () => {
    expect(isLocalDevMode()).toBe(true)

    const { data, error } = await getEmpresa('demo-user')

    expect(error).toBeNull()
    expect(data?.nombre).toBe('Empresa Demo')
  })

  it('builds and resolves invoice numbers deterministically', () => {
    expect(construirFolioFactura({ folio: '', serie: 'FAC', fallbackNumero: 3 })).toBe('FAC-0003')
    expect(construirFolioFactura({ folio: '', serie: 'FAC-', fallbackNumero: 3 })).toBe('FAC-0003')
    expect(construirFolioFactura({ folio: 3, serie: 'FAC', fallbackNumero: 1 })).toBe('FAC-0003')
    expect(resolverFolioFactura({ folio: '', serie: 'FAC', existingFolios: ['FAC-0001', 'FAC-0003'] })).toBe('FAC-0004')
    expect(resolverFolioFactura({ folio: '', serie: 'FAC-', existingFolios: ['FAC--0078', 'FAC--0079'] })).toBe('FAC-0080')
  })

  it('seeds demo invoices so the invoices page is not empty in public demo mode', async () => {
    expect(isLocalDevMode()).toBe(true)

    const { data, error } = await getFacturas('local-demo-company')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].folio).toBe('FAC-0002')
  })

  it('persists a newly created invoice so it appears in the invoice list', async () => {
    const { data: created, error: createError } = await createFactura({
      empresa_id: 'local-demo-company',
      cliente_id: 'cliente-demo-1',
      folio: 'FAC-0999',
      fecha_emision: '2026-07-29',
      fecha_vencimiento: '2026-08-28',
      estado: 'emitida',
      subtotal: 100,
      iva_total: 21,
      total: 121,
      notas: 'Test de regresión',
    }, [{
      descripcion: 'Producto de prueba',
      cantidad: 1,
      precio_unitario: 100,
      iva_tasa: 21,
      descuento: 0,
      subtotal: 100,
      recargo_tasa: 0,
      recargo_importe: 0,
      producto_id: 'producto-demo-1',
    }])

    expect(createError).toBeNull()
    expect(created?.id).toBeTruthy()

    const { data, error } = await getFacturas('local-demo-company')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data.some(item => item.id === created?.id)).toBe(true)
  })

  it('normalizes bare verification domains so QR links are mobile-friendly', async () => {
    const empresa = { id: 'local-demo-company', nif_cif: 'B00000000', factura_config: { verification_url: 'verificacion.miempresa.com' } }
    const factura = { id: 'qr-test-id', empresa_id: 'local-demo-company', folio: 'FAC-0001', total: 121, fecha_emision: '2026-07-29' }

    const qrUrl = await buildVerificationUrl({ empresa, factura })

    expect(qrUrl).toContain('https://verificacion.miempresa.com/verificar?')
    expect(qrUrl).toContain('folio=FAC-0001')
  })

  it('uses the current browser origin when no custom verification URL is configured', async () => {
    global.window = {
      ...global.window,
      location: { ...global.window.location, origin: 'https://miempresa.com' },
    }

    const qrUrl = await buildVerificationUrl({
      empresa: { id: 'local-demo-company', nif_cif: 'B00000000', factura_config: {} },
      factura: { id: 'qr-origin-id', empresa_id: 'local-demo-company', folio: 'FAC-0100', total: 121, fecha_emision: '2026-07-29' },
    })

    expect(qrUrl).toContain('https://miempresa.com/verificar?')
  })

  it('resolves relative verification paths to an absolute URL', async () => {
    global.window = {
      ...global.window,
      location: { ...global.window.location, origin: 'https://miempresa.com' },
    }

    const qrUrl = await buildVerificationUrl({
      empresa: { id: 'local-demo-company', nif_cif: 'B00000000', factura_config: { verification_url: '/verificar' } },
      factura: { id: 'qr-relative-id', empresa_id: 'local-demo-company', folio: 'FAC-0110', total: 121, fecha_emision: '2026-07-29' },
    })

    expect(qrUrl).toContain('https://miempresa.com/verificar?')
    expect(qrUrl.startsWith('/')).toBe(false)
  })

  it('builds a QR verification URL and validates a demo invoice', async () => {
    const empresa = { id: 'local-demo-company', nif_cif: 'B00000000', factura_config: {} }
    const createdFactura = {
      empresa_id: 'local-demo-company',
      cliente_id: 'cliente-demo-1',
      folio: 'FAC-9999',
      fecha_emision: '2026-07-29',
      fecha_vencimiento: '2026-08-28',
      estado: 'emitida',
      subtotal: 100,
      iva_total: 21,
      total: 121,
      notas: 'QR test',
    }

    const { data: created, error: createError } = await createFactura(createdFactura, [{
      descripcion: 'Producto de prueba QR',
      cantidad: 1,
      precio_unitario: 100,
      iva_tasa: 21,
      descuento: 0,
      subtotal: 100,
      recargo_tasa: 0,
      recargo_importe: 0,
      producto_id: 'producto-demo-1',
    }])

    expect(createError).toBeNull()

    const factura = { id: created?.id, empresa_id: created?.empresa_id, folio: created?.folio, total: created?.total, fecha_emision: created?.fecha_emision }
    const qrUrl = await buildVerificationUrl({ empresa, factura })

    expect(qrUrl).toContain('/verificar?')
    expect(qrUrl).toContain(`folio=${created?.folio}`)
    expect(qrUrl).toContain(`id=${created?.id}`)
    expect(qrUrl).toContain('nif=B00000000')

    const { data, error } = await import('./supabase').then(({ verificarFactura }) => verificarFactura({ id: created?.id, empresa_id: created?.empresa_id, folio: created?.folio, nif: 'B00000000', total: created?.total, fecha: created?.fecha_emision }))

    expect(error).toBeNull()
    expect(data?.folio).toBe(created?.folio)
  })
})
