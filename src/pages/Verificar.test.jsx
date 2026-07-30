import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Verificar from './Verificar'

describe('Verificar', () => {
  it('shows a public legal verification message for QR scans', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/verificar?folio=FAC-001&id=123&total=121&fecha=2026-07-29']}>
        <Verificar />
      </MemoryRouter>
    )

    expect(html).toContain('comprobación')
    expect(html).toContain('cualquier persona')
  })
})
