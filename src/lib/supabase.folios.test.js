import { describe, it, expect } from 'vitest'
import { parseFolioNum } from './supabase'

describe('parseFolioNum', () => {
  it('parsea folio nuevo FAC-0010 → 10', () => {
    expect(parseFolioNum('FAC-0010')).toBe(10)
  })

  it('parsea folio antiguo FAC--0079 → 79', () => {
    expect(parseFolioNum('FAC--0079')).toBe(79)
  })

  it('parsea folio antiguo FAC--0060 → 60', () => {
    expect(parseFolioNum('FAC--0060')).toBe(60)
  })

  it('devuelve 0 para folio vacío o nulo', () => {
    expect(parseFolioNum('')).toBe(0)
    expect(parseFolioNum(null)).toBe(0)
    expect(parseFolioNum(undefined)).toBe(0)
  })
})

describe('orden de facturas con folios mixtos', () => {
  const sortFacturas = (arr) =>
    [...arr].sort((a, b) => {
      const diff = parseFolioNum(b.folio) - parseFolioNum(a.folio)
      if (diff !== 0) return diff
      return (b.fecha_emision || '') < (a.fecha_emision || '') ? -1 : 1
    })

  it('FAC--0079 aparece antes que FAC-0010', () => {
    const facturas = [
      { folio: 'FAC-0010', fecha_emision: '2026-09-01' },
      { folio: 'FAC--0079', fecha_emision: '2024-01-15' },
    ]
    const sorted = sortFacturas(facturas)
    expect(sorted[0].folio).toBe('FAC--0079')
    expect(sorted[1].folio).toBe('FAC-0010')
  })

  it('lista completa con ambos rangos se ordena de mayor a menor número', () => {
    const facturas = [
      { folio: 'FAC-0001', fecha_emision: '2025-01-01' },
      { folio: 'FAC--0060', fecha_emision: '2020-01-01' },
      { folio: 'FAC-0010', fecha_emision: '2026-09-01' },
      { folio: 'FAC--0079', fecha_emision: '2024-01-15' },
    ]
    const sorted = sortFacturas(facturas)
    const nums = sorted.map(f => parseFolioNum(f.folio))
    expect(nums).toEqual([79, 60, 10, 1])
  })

  it('folios con mismo número se ordenan por fecha_emision DESC', () => {
    const facturas = [
      { folio: 'FAC-0005', fecha_emision: '2025-01-01' },
      { folio: 'FAC-0005', fecha_emision: '2026-01-01' },
    ]
    const sorted = sortFacturas(facturas)
    expect(sorted[0].fecha_emision).toBe('2026-01-01')
  })

  it('calcula el siguiente folio correcto cuando el max es FAC--0079', () => {
    const facturas = [
      { folio: 'FAC-0001' },
      { folio: 'FAC--0060' },
      { folio: 'FAC-0010' },
      { folio: 'FAC--0079' },
    ]
    const maxNum = facturas.reduce((max, f) => {
      const n = parseFolioNum(f.folio)
      return n > max ? n : max
    }, 0)
    expect(maxNum).toBe(79)
    expect(maxNum + 1).toBe(80)
  })
})
