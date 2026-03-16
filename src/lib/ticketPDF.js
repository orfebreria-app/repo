import jsPDF from 'jspdf'

const fmt  = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
const fmtN = (n) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2 }).format(n || 0)

export async function generarTicketPDF({ ticket, empresa, lineas }) {
  const W = 80
  const M = 4

  // Primera pasada para calcular altura
  let y = calcularContenido({ ticket, empresa, lineas, W, M, dry: true })
  const altura = Math.max(y + 15, 100)

  // Segunda pasada real con altura exacta
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [W, altura] })
  doc.setFont('courier', 'normal')
  doc.setTextColor(30, 30, 30)

  renderContenido({ doc, ticket, empresa, lineas, W, M })

  return doc
}

function calcularContenido({ ticket, empresa, lineas, W, M, dry }) {
  let y = 6
  const nl  = (n = 4) => { y += n }
  const sep = ()      => { y += 4 }
  const row = ()      => { y += 4.5 }

  // Cabecera
  nl(6) // nombre empresa
  if (empresa?.direccion) nl(4)
  if (empresa?.nif_cif)   nl(4)
  if (empresa?.telefono)  nl(4)
  nl(4) // email
  nl(1); sep() // sep2

  nl(5) // ticket nº
  row()  // fecha/hora
  sep()  // sep

  // Artículos
  lineas.forEach(l => {
    nl(4.5)
    row()
    nl(4) // iva tasa
  })
  sep()

  // Desglose IVA
  const tasas = [...new Set(lineas.map(l => Number(l.iva_tasa || 0)))]
  tasas.forEach(() => { row(); row() })

  sep() // sep2
  nl(5) // TOTAL
  nl(4) // IVA incluido
  sep() // sep2

  row() // forma pago
  if (ticket.metodo_pago === 'efectivo' && ticket.efectivo_entregado) { row(); row() }

  sep()
  if (ticket.notas) nl(5)
  nl(5) // gracias
  nl(4)
  nl(4)
  nl(6)

  return y
}

function renderContenido({ doc, ticket, empresa, lineas, W, M }) {
  let y = 6

  const line = (txt, size = 8, bold = false, align = 'left') => {
    doc.setFontSize(size)
    doc.setFont('courier', bold ? 'bold' : 'normal')
    const x = align === 'center' ? W / 2 : align === 'right' ? W - M : M
    doc.text(String(txt), x, y, { align })
  }
  const sep  = (c = '-') => { line(c.repeat(Math.floor((W - M * 2) / 1.8))); y += 4 }
  const sep2 = ()        => { line('='.repeat(Math.floor((W - M * 2) / 1.8))); y += 4 }
  const nl   = (n = 4)  => { y += n }
  const twoCol = (left, right, size = 8, bold = false) => {
    doc.setFontSize(size); doc.setFont('courier', bold ? 'bold' : 'normal')
    doc.text(String(left),  M, y)
    doc.text(String(right), W - M, y, { align: 'right' })
    y += 4.5
  }

  // Cabecera
  line(empresa?.nombre || 'Mi Empresa', 11, true, 'center'); nl(6)
  if (empresa?.direccion) { line(empresa.direccion, 7, false, 'center'); nl(4) }
  if (empresa?.nif_cif)   { line(`NIF/CIF: ${empresa.nif_cif}`, 7, false, 'center'); nl(4) }
  if (empresa?.telefono)  { line(`Tel: ${empresa.telefono}`, 7, false, 'center'); nl(4) }
  line('info@trofeosaka.es', 7, false, 'center'); nl(4)
  nl(1); sep2()

  // Nº y fecha
  const fecha = new Date(ticket.creado_en || ticket.fecha || new Date())
  const fechaStr = fecha.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' })
  const horaStr  = fecha.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
  line(`TICKET Nº ${String(ticket.numero).padStart(6,'0')}`, 9, true, 'center'); nl(5)
  twoCol('Fecha:', fechaStr)
  twoCol('Hora:',  horaStr)
  sep()

  // Artículos
  line('ARTÍCULOS', 8, true); nl(5)
  lineas.forEach(l => {
    const desc = String(l.descripcion || '').slice(0, 28)
    line(desc, 8, false); nl(4.5)
    const precio = Number(l.precio_unitario || 0)
    const subtotal = Number(l.subtotal || precio * Number(l.cantidad || 1))
    twoCol(`  ${fmtN(l.cantidad)} x ${fmt(precio)} (IVA ${l.iva_tasa}% incl.)`, fmt(subtotal), 7)
  })
  sep()

  // Desglose IVA por tasa
  line('DESGLOSE FISCAL', 7, true); y += 4
  const desgloseIva = {}
  lineas.forEach(l => {
    const tasa = Number(l.iva_tasa || 0)
    if (!desgloseIva[tasa]) desgloseIva[tasa] = { base: 0, iva: 0 }
    const totalLinea = Number(l.subtotal || 0)
    const divisor = 1 + tasa / 100
    const base = +(totalLinea / divisor).toFixed(2)
    desgloseIva[tasa].base += base
    desgloseIva[tasa].iva  += +(totalLinea - base).toFixed(2)
  })
  Object.entries(desgloseIva).forEach(([tasa, d]) => {
    twoCol(`  Base ${tasa}%:`, fmt(d.base), 7)
    twoCol(`  IVA ${tasa}%:`,  fmt(d.iva), 7)
  })
  if (ticket.recargo_total > 0) twoCol('Rec. Equiv.:', fmt(ticket.recargo_total), 7)

  sep2()
  doc.setFontSize(11); doc.setFont('courier', 'bold')
  doc.text('TOTAL:', M, y)
  doc.text(fmt(ticket.total), W - M, y, { align: 'right' })
  y += 5
  line('Precios con IVA incluido', 7, false, 'center'); nl(4)
  sep2()

  // Pago
  const metodoLabel = { efectivo:'Efectivo', tarjeta:'Tarjeta', bizum:'Bizum', transferencia:'Transferencia' }[ticket.metodo_pago] || ticket.metodo_pago
  twoCol('Forma de pago:', metodoLabel, 8)
  if (ticket.metodo_pago === 'efectivo' && ticket.efectivo_entregado) {
    twoCol('Entregado:', fmt(ticket.efectivo_entregado), 8)
    twoCol('Cambio:', fmt(ticket.cambio || 0), 9, true)
  }
  nl(2); sep()

  if (ticket.notas) { line(ticket.notas, 7, false, 'center'); nl(5) }
  line('¡Gracias por su compra!', 8, true, 'center'); nl(5)
  line('Conserve este ticket', 7, false, 'center'); nl(4)
  line('como justificante de compra', 7, false, 'center')
}
