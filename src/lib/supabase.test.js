import { beforeEach, describe, expect, it } from 'vitest'
import { getFacturas, isLocalDevMode } from './supabase'

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

  it('activates local demo mode on localhost and returns invoices from local storage', async () => {
    expect(isLocalDevMode()).toBe(true)

    const { data, error } = await getFacturas('local-demo-company')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})
