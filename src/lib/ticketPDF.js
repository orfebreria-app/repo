import jsPDF from 'jspdf'

const fmt  = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
const fmtN = (n) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2 }).format(n || 0)

export async function generarTicketPDF({ ticket, empresa, lineas }) {
  // Formato estrecho tipo ticket térmico (80mm → ~72mm útil)
  const W  = 80
  const M  = 4
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [W, 200] })

  doc.setFont('courier', 'normal')
  let y = 6

  const line  = (txt, size = 8, bold = false, align = 'left') => {
    doc.setFontSize(size)
    doc.setFont('courier', bold ? 'bold' : 'normal')
    const x = align === 'center' ? W / 2 : align === 'right' ? W - M : M
    doc.text(txt, x, y, { align })
  }
  const sep   = (c = '-') => { line(c.repeat(Math.floor((W - M * 2) / 1.8)), 8); y += 4 }
  const nl    = (n = 4)   => { y += n }
  const twoCol = (left, right, size = 8, bold = false) => {
    doc.setFontSize(size)
    doc.setFont('courier', bold ? 'bold' : 'normal')
    doc.text(left,  M, y)
    doc.text(right, W - M, y, { align: 'right' })
    y += 4.5
  }

  // ── Cabecera ──────────────────────────────────────
  doc.setTextColor(30, 30, 30)
  line(empresa?.nombre || 'Mi Empresa', 11, true, 'center'); nl(6)
  if (empresa?.direccion) { line(empresa.direccion, 7, false, 'center'); nl(4) }
  if (empresa?.nif_cif)   { line(`NIF/CIF: ${empresa.nif_cif}`, 7, false, 'center'); nl(4) }
  if (empresa?.telefono)  { line(`Tel: ${empresa.telefono}`, 7, false, 'center'); nl(4) }
  nl(1)
  sep('=')

  // ── Número y fecha ────────────────────────────────
  const fecha = new Date(ticket.fecha)
  const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const horaStr  = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  line(`TICKET Nº ${String(ticket.numero).padStart(6, '0')}`, 9, true, 'center'); nl(5)
  twoCol('Fecha:', fechaStr)
  twoCol('Hora:',  horaStr)
  sep()

  // ── Artículos ─────────────────────────────────────
  line('ARTÍCULOS', 8, true); nl(5)
  lineas.forEach(l => {
    // Descripción (puede ser larga, la cortamos)
    const desc = l.descripcion.length > 22 ? l.descripcion.slice(0, 22) + '...' : l.descripcion
    line(desc, 8, false); nl(4.5)
    const cant   = `${fmtN(l.cantidad)} x ${fmt(l.precio_unitario)}`
    const importe = fmt(l.subtotal)
    twoCol(`  ${cant}`, importe, 8)
    if (Number(l.iva_tasa) > 0) {
      line(`  IVA ${l.iva_tasa}%`, 7)
      nl(4)
    }
  })
  sep()

  // ── Totales ───────────────────────────────────────
  twoCol('Subtotal:', fmt(ticket.subtotal))
  twoCol('IVA:', fmt(ticket.iva_total))
  sep('-')
  doc.setTextColor(0, 0, 0)
  twoCol('TOTAL:', fmt(ticket.total), 11, true)
  sep('-')
  doc.setTextColor(30, 30, 30)
  nl(1)

  // ── Pago ──────────────────────────────────────────
  const metodoLabel = {
    efectivo:      '💵 Efectivo',
    tarjeta:       '💳 Tarjeta',
    bizum:         '📱 Bizum',
    transferencia: '🏦 Transferencia',
  }[ticket.metodo_pago] || ticket.metodo_pago

  twoCol('Forma de pago:', metodoLabel, 8)
  if (ticket.metodo_pago === 'efectivo' && ticket.efectivo_entregado) {
    twoCol('Entregado:', fmt(ticket.efectivo_entregado))
    twoCol('Cambio:', fmt(ticket.cambio || 0), 9, true)
  }
  nl(2)
  sep('=')

  // ── Pie ───────────────────────────────────────────
  if (ticket.notas) {
    line(ticket.notas, 7, false, 'center'); nl(5)
  }
  nl(1)
  line('¡Gracias por su compra!', 8, true, 'center'); nl(5)
  line('Conserve este ticket', 7, false, 'center'); nl(4)
  line('como justificante de compra', 7, false, 'center'); nl(6)

  // Recortar el PDF a la altura real del contenido
  const pageHeight = Math.max(y + 10, 80)
  const trimmed = new jsPDF({ orientation: 'p', unit: 'mm', format: [W, pageHeight] })
  const imgData = doc.output('datauristring')
  // Re-generamos con altura exacta
  return generarTicketPDFExacto({ ticket, empresa, lineas, altura: pageHeight })
}

// Segunda pasada con altura exacta
async function generarTicketPDFExacto({ ticket, empresa, lineas, altura }) {
  const W  = 80
  const M  = 4
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [W, altura] })

  doc.setFont('courier', 'normal')
  doc.setTextColor(30, 30, 30)
  let y = 6

  const line  = (txt, size = 8, bold = false, align = 'left') => {
    doc.setFontSize(size)
    doc.setFont('courier', bold ? 'bold' : 'normal')
    const x = align === 'center' ? W / 2 : align === 'right' ? W - M : M
    doc.text(txt, x, y, { align })
  }
  const sep   = (c = '-') => { line(c.repeat(Math.floor((W - M * 2) / 1.8)), 8); y += 4 }
  const nl    = (n = 4)   => { y += n }
  const twoCol = (left, right, size = 8, bold = false) => {
    doc.setFontSize(size)
    doc.setFont('courier', bold ? 'bold' : 'normal')
    doc.text(left,  M, y)
    doc.text(right, W - M, y, { align: 'right' })
    y += 4.5
  }

  line(empresa?.nombre || 'Mi Empresa', 11, true, 'center'); nl(6)
  if (empresa?.direccion) { line(empresa.direccion, 7, false, 'center'); nl(4) }
  if (empresa?.nif_cif)   { line(`NIF/CIF: ${empresa.nif_cif}`, 7, false, 'center'); nl(4) }
  if (empresa?.telefono)  { line(`Tel: ${empresa.telefono}`, 7, false, 'center'); nl(4) }
  nl(1); sep('=')

  const fecha    = new Date(ticket.fecha)
  const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const horaStr  = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  line(`TICKET Nº ${String(ticket.numero).padStart(6, '0')}`, 9, true, 'center'); nl(5)
  twoCol('Fecha:', fechaStr)
  twoCol('Hora:', horaStr)
  sep()

  line('ARTÍCULOS', 8, true); nl(5)
  lineas.forEach(l => {
    const desc = l.descripcion.length > 22 ? l.descripcion.slice(0, 22) + '...' : l.descripcion
    line(desc, 8, false); nl(4.5)
    twoCol(`  ${fmtN(l.cantidad)} x ${fmt(l.precio_unitario)}`, fmt(l.subtotal), 8)
    if (Number(l.iva_tasa) > 0) { line(`  IVA ${l.iva_tasa}%`, 7); nl(4) }
  })
  sep()

  twoCol('Subtotal:', fmt(ticket.subtotal))
  twoCol('IVA:', fmt(ticket.iva_total))
  sep('-')
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11); doc.setFont('courier', 'bold')
  doc.text('TOTAL:', M, y)
  doc.text(fmt(ticket.total), W - M, y, { align: 'right' })
  y += 5
  doc.setTextColor(30, 30, 30)
  sep('-'); nl(1)

  const metodoLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum', transferencia: 'Transferencia' }[ticket.metodo_pago] || ticket.metodo_pago
  twoCol('Forma de pago:', metodoLabel, 8)
  if (ticket.metodo_pago === 'efectivo' && ticket.efectivo_entregado) {
    twoCol('Entregado:', fmt(ticket.efectivo_entregado))
    twoCol('Cambio:', fmt(ticket.cambio || 0), 9, true)
  }
  nl(2); sep('='); nl(1)
  if (ticket.notas) { line(ticket.notas, 7, false, 'center'); nl(5) }
  line('¡Gracias por su compra!', 8, true, 'center'); nl(5)
  line('Conserve este ticket', 7, false, 'center'); nl(4)
  line('como justificante de compra', 7, false, 'center')

  return doc
}
