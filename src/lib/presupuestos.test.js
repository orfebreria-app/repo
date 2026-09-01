import { describe, it, expect } from 'vitest'

// Filtering logic mirrored from src/pages/Presupuestos.jsx
const filtrarPresupuestos = (lista, filtro, buscar) =>
  lista
    .filter(p => filtro === 'todos' || p.estado === filtro)
    .filter(p =>
      p.numero.toLowerCase().includes(buscar.toLowerCase()) ||
      (p.clientes?.nombre || '').toLowerCase().includes(buscar.toLowerCase())
    )

// Stable sort by creado_en DESC, then fecha_emision DESC (mirrors cargar query)
const sortPresupuestos = (lista) =>
  [...lista].sort((a, b) => {
    const ca = a.creado_en || ''
    const cb = b.creado_en || ''
    if (cb !== ca) return cb > ca ? 1 : -1
    const fa = a.fecha_emision || ''
    const fb = b.fecha_emision || ''
    return fb > fa ? 1 : fb < fa ? -1 : 0
  })

const PRE_0021 = {
  id: 'uuid-0021',
  numero: 'PRE-0021',
  estado: 'borrador',
  total: 276.96,
  creado_en: '2026-09-01T10:00:00Z',
  fecha_emision: '2026-09-01',
  clientes: { nombre: 'FUNDACIÓN DCH', email: 'dch@example.com' },
}

const LISTA_MUESTRA = [
  { id: 'uuid-0020', numero: 'PRE-0020', estado: 'aceptado', total: 100, creado_en: '2026-08-01T08:00:00Z', fecha_emision: '2026-08-01', clientes: { nombre: 'Cliente A' } },
  PRE_0021,
  { id: 'uuid-0019', numero: 'PRE-0019', estado: 'enviado',  total: 200, creado_en: '2026-07-01T08:00:00Z', fecha_emision: '2026-07-01', clientes: { nombre: 'Cliente B' } },
]

describe('filtrarPresupuestos', () => {
  it('muestra PRE-0021 borrador con filtro "todos"', () => {
    const result = filtrarPresupuestos(LISTA_MUESTRA, 'todos', '')
    const nums = result.map(p => p.numero)
    expect(nums).toContain('PRE-0021')
  })

  it('muestra PRE-0021 borrador con filtro "borrador"', () => {
    const result = filtrarPresupuestos(LISTA_MUESTRA, 'borrador', '')
    expect(result).toHaveLength(1)
    expect(result[0].numero).toBe('PRE-0021')
    expect(result[0].estado).toBe('borrador')
    expect(result[0].total).toBe(276.96)
  })

  it('no oculta borrador recién creado cuando el filtro es "todos"', () => {
    const result = filtrarPresupuestos(LISTA_MUESTRA, 'todos', '')
    expect(result).toHaveLength(3)
  })

  it('no oculta registros de estados distintos cuando el filtro es "todos"', () => {
    const result = filtrarPresupuestos(LISTA_MUESTRA, 'todos', '')
    const estados = result.map(p => p.estado)
    expect(estados).toContain('aceptado')
    expect(estados).toContain('enviado')
    expect(estados).toContain('borrador')
  })

  it('filtra por número de presupuesto (búsqueda insensible a mayúsculas)', () => {
    const result = filtrarPresupuestos(LISTA_MUESTRA, 'todos', 'pre-0021')
    expect(result).toHaveLength(1)
    expect(result[0].numero).toBe('PRE-0021')
  })

  it('filtra por nombre de cliente', () => {
    const result = filtrarPresupuestos(LISTA_MUESTRA, 'todos', 'fundación dch')
    expect(result).toHaveLength(1)
    expect(result[0].numero).toBe('PRE-0021')
  })

  it('devuelve vacío cuando ningún presupuesto coincide', () => {
    const result = filtrarPresupuestos(LISTA_MUESTRA, 'todos', 'INEXISTENTE')
    expect(result).toHaveLength(0)
  })
})

describe('sortPresupuestos', () => {
  it('ordena por creado_en DESC, el más reciente primero', () => {
    const sorted = sortPresupuestos(LISTA_MUESTRA)
    expect(sorted[0].numero).toBe('PRE-0021')
  })

  it('usa fecha_emision como desempate cuando creado_en es igual', () => {
    const mismoInstante = [
      { numero: 'PRE-A', creado_en: '2026-09-01T10:00:00Z', fecha_emision: '2026-08-01' },
      { numero: 'PRE-B', creado_en: '2026-09-01T10:00:00Z', fecha_emision: '2026-09-01' },
    ]
    const sorted = sortPresupuestos(mismoInstante)
    expect(sorted[0].numero).toBe('PRE-B')
  })

  it('maneja entradas con creado_en nulo sin romper', () => {
    const conNulos = [
      { numero: 'PRE-X', creado_en: null, fecha_emision: '2026-09-01' },
      { numero: 'PRE-Y', creado_en: '2026-09-01T10:00:00Z', fecha_emision: '2026-09-01' },
    ]
    expect(() => sortPresupuestos(conNulos)).not.toThrow()
    // el que tiene fecha definida aparece primero
    expect(sortPresupuestos(conNulos)[0].numero).toBe('PRE-Y')
  })
})
