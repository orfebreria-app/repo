import { beforeEach, describe, expect, it } from 'vitest'
import { createSupabaseClient, getFacturas, isLocalDevMode } from './supabase'

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

  it('activates local demo mode on localhost and returns invoices from local storage', async () => {
    expect(isLocalDevMode()).toBe(true)

    const { data, error } = await getFacturas('local-demo-company')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})
