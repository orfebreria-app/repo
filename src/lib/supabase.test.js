import { beforeEach, describe, expect, it } from 'vitest'
import { createSupabaseClient, construirFolioFactura, getEmpresa, getFacturas, isLocalDevMode, resolverFolioFactura } from './supabase'

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
})
