import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── PLANTILLAS ───────────────────────────────────────────
export const PLANTILLAS = [
  { id: 'moderna',   nombre: 'Moderna',    desc: 'Limpia con cabecera de color' },
  { id: 'clasica',   nombre: 'Clásica',    desc: 'Líneas simples y profesional' },
  { id: 'minimalista', nombre: 'Minimalista', desc: 'Solo lo esencial, muy elegante' },
]

export const COLORES = [
  { id: 'azul',     nombre: 'Azul',      hex: '#1D4ED8', rgb: [29, 78, 216] },
  { id: 'verde',    nombre: 'Verde',     hex: '#059669', rgb: [5, 150, 105] },
  { id: 'negro',    nombre: 'Negro',     hex: '#111827', rgb: [17, 24, 39] },
  { id: 'rojo',     nombre: 'Rojo',      hex: '#DC2626', rgb: [220, 38, 38] },
  { id: 'morado',   nombre: 'Morado',    hex: '#7C3AED', rgb: [124, 58, 237] },
  { id: 'naranja',  nombre: 'Naranja',   hex: '#D97706', rgb: [217, 119, 6] },
  { id: 'teal',     nombre: 'Teal',      hex: '#0F766E', rgb: [15, 118, 110] },
]

// ─── HELPERS ─────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

// Carga imagen como base64 y devuelve dimensiones originales
const loadImage = (url) =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve({ data: canvas.toDataURL('image/png'), w: img.width, h: img.height })
    }
    img.onerror = () => resolve(null)
    img.src = url
  })

// Calcula dimensiones en mm respetando proporciones del logo
const logoSize = (img, maxW, maxH) => {
  if (!img) return { w: 0, h: 0 }
  const ratio = img.w / img.h
  let w = maxW, h = maxW / ratio
  if (h > maxH) { h = maxH; w = maxH * ratio }
  return { w: +w.toFixed(1), h: +h.toFixed(1) }
}

// ─── GENERADOR PRINCIPAL ──────────────────────────────────
export async function generarPDF({ factura, empresa, conceptos, plantilla = 'moderna', colorId = 'azul', logoUrl = null }) {
  const color = COLORES.find(c => c.id === colorId) || COLORES[0]
  const doc   = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  const W = 210
  const M = 15

  // Toma config de empresa si existe
  const cfg       = empresa?.factura_config || {}
  const textoPie  = cfg.textoPie  || ''
  const formaPago = cfg.formaPago || ''
  const notasDefault = cfg.notas  || ''

  let logoData = null
  if (logoUrl) logoData = await loadImage(logoUrl)

  const extra = { textoPie, formaPago, notasDefault }

  if (plantilla === 'moderna')      await plantillaModerna(doc,  { factura, empresa, conceptos, color, logoData, W, M, fmt, fmtFecha, ...extra })
  else if (plantilla === 'clasica') await plantillaClasica(doc,  { factura, empresa, conceptos, color, logoData, W, M, fmt, fmtFecha, ...extra })
  else                              await plantillaMinimalista(doc, { factura, empresa, conceptos, color, logoData, W, M, fmt, fmtFecha, ...extra })

  // Pie de página
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(160, 160, 160)
    doc.text(`Página ${i} de ${pages}`, W / 2, 290, { align: 'center' })
    if (empresa?.nombre) doc.text(empresa.nombre, M, 290)
  }

  return doc
}

// ═══════════════════════════════════════════════════════
// PLANTILLA: MODERNA
// ═══════════════════════════════════════════════════════
async function plantillaModerna(doc, { factura, empresa, conceptos, color, logoData, W, M, fmt, fmtFecha, textoPie, formaPago, notasDefault }) {
  const [r, g, b] = color.rgb

  // Cabecera con fondo de color
  doc.setFillColor(r, g, b)
  doc.rect(0, 0, W, 45, 'F')

  // Logo en cabecera
  if (logoData) {
    const { w: lw, h: lh } = logoSize(logoData, 25, 38)
    try { doc.addImage(logoData.data, 'PNG', M, 3, lw, lh) } catch(e) {}
  }

  // Nombre empresa en cabecera
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  const nombreX = logoData ? M + 28 : M
  doc.text(empresa?.nombre || 'Mi Empresa', nombreX, 20)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  if (empresa?.nif_cif)   doc.text(`NIF/CIF: ${empresa.nif_cif}`, nombreX, 27)
  if (empresa?.direccion) doc.text(empresa.direccion, nombreX, 33)
  if (empresa?.email)     doc.text(empresa.email, nombreX, 39)

  // Etiqueta FACTURA
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('FACTURA', W - M, 22, { align: 'right' })
  doc.setFontSize(12)
  doc.text(factura.folio, W - M, 32, { align: 'right' })

  // Resto del contenido
  doc.setTextColor(30, 30, 30)
  let y = 55

  // Bloque: datos factura + datos cliente
  doc.setFillColor(248, 249, 250)
  doc.roundedRect(M, y, W - M * 2, 32, 2, 2, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text('DATOS DE FACTURA', M + 5, y + 7)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'normal')
  doc.text(`Fecha de emisión: ${fmtFecha(factura.fecha_emision)}`, M + 5, y + 14)
  doc.text(`Fecha vencimiento: ${fmtFecha(factura.fecha_vencimiento)}`, M + 5, y + 20)
  doc.text(`Estado: ${(factura.estado || '').toUpperCase()}`, M + 5, y + 26)

  const cx = W / 2 + 5
  const cliente = factura.clientes
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text('FACTURAR A', cx, y + 7)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'normal')
  if (cliente?.nombre)   doc.text(cliente.nombre, cx, y + 14)
  if (cliente?.nif_cif)  doc.text(`NIF/CIF: ${cliente.nif_cif}`, cx, y + 20)
  if (cliente?.email)    doc.text(cliente.email, cx, y + 26)

  y += 40

  // Tabla de conceptos
  autoTable(doc, {
    startY: y,
    head: [['Descripción', 'Cant.', 'Precio unit.', 'IVA', 'Dto.', 'Subtotal']],
    body: conceptos.map(c => [
      c.descripcion,
      Number(c.cantidad).toLocaleString('es-ES'),
      fmt(c.precio_unitario),
      `${c.iva_tasa}%`,
      `${c.descuento || 0}%`,
      fmt(c.subtotal),
    ]),
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 15 },
      4: { halign: 'right', cellWidth: 15 },
      5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
    margin: { left: M, right: M },
  })

  y = doc.lastAutoTable.finalY + 8

  // Totales
  const totW = 70
  const totX = W - M - totW
  doc.setFillColor(248, 249, 250)
  doc.roundedRect(totX, y, totW, 32, 2, 2, 'F')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text('Subtotal:', totX + 5, y + 9)
  doc.text('IVA:', totX + 5, y + 17)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text('TOTAL:', totX + 5, y + 26)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 30)
  doc.text(fmt(factura.subtotal), totX + totW - 5, y + 9, { align: 'right' })
  doc.text(fmt(factura.iva_total), totX + totW - 5, y + 17, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(r, g, b)
  doc.text(fmt(factura.total), totX + totW - 5, y + 26, { align: 'right' })

  // Notas factura o notas por defecto
  const notasTexto = factura.notas || notasDefault
  if (notasTexto) {
    y += 40
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text('NOTAS / CONDICIONES', M, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    const lines = doc.splitTextToSize(notasTexto, W - M * 2)
    doc.text(lines, M, y + 6)
    y += lines.length * 4 + 10
  } else {
    y += 40
  }

  // Forma de pago
  if (formaPago) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text('FORMA DE PAGO', M, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(doc.splitTextToSize(formaPago, W - M * 2), M, y + 6)
    y += 14
  }

  // Texto pie
  if (textoPie) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text(textoPie, W / 2, y + 6, { align: 'center' })
  }
}
// ═══════════════════════════════════════════════════════
async function plantillaClasica(doc, { factura, empresa, conceptos, color, logoData, W, M, fmt, fmtFecha, textoPie, formaPago, notasDefault }) {
  const [r, g, b] = color.rgb
  let y = M

  // Logo — calculamos su altura real para bajar la línea
  let logoH = 0
  if (logoData) {
    const { w: lw, h: lh } = logoSize(logoData, 30, 40)
    try { doc.addImage(logoData.data, 'PNG', M, y, lw, lh) } catch(e) {}
    logoH = lh
  }

  // Nombre empresa (a la derecha del logo)
  const exOff = logoData ? M + 35 : M
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text(empresa?.nombre || 'Mi Empresa', exOff, y + 10)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  let infoY = y + 17
  if (empresa?.nif_cif)   { doc.text(`NIF/CIF: ${empresa.nif_cif}`, exOff, infoY); infoY += 5 }
  if (empresa?.direccion) { doc.text(empresa.direccion, exOff, infoY); infoY += 5 }
  if (empresa?.email)     { doc.text(empresa.email, exOff, infoY); infoY += 5 }

  // FACTURA título (derecha)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('FACTURA', W - M, y + 10, { align: 'right' })
  doc.setFontSize(10)
  doc.setTextColor(r, g, b)
  doc.text(factura.folio, W - M, y + 20, { align: 'right' })

  // Línea separadora — respeta la altura del logo + margen
  const lineY = Math.max(logoH + M + 8, infoY + 4, 48)
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.8)
  doc.line(M, lineY, W - M, lineY)
  y = lineY + 10

  // Info factura y cliente en 2 columnas
  const col2 = W / 2 + 5
  doc.setFontSize(8)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text('DETALLES DE FACTURA', M, y)
  let detY = y + 5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  doc.text(`Número: ${factura.folio}`, M, detY);                        detY += 5
  doc.text(`Fecha: ${fmtFecha(factura.fecha_emision)}`, M, detY);       detY += 5
  doc.text(`Vencimiento: ${fmtFecha(factura.fecha_vencimiento)}`, M, detY)

  let cy = y
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text('FACTURAR A', col2, cy); cy += 5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  const cliente = factura.clientes
  if (cliente?.nombre)   { doc.text(cliente.nombre, col2, cy); cy += 5 }
  if (cliente?.nif_cif)  { doc.text(`NIF/CIF: ${cliente.nif_cif}`, col2, cy); cy += 5 }
  if (cliente?.email)    { doc.text(cliente.email, col2, cy); cy += 5 }

  y = Math.max(detY, cy) + 10

  // Línea fina
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(M, y, W - M, y)
  y += 5

  // Tabla
  autoTable(doc, {
    startY: y,
    head: [['Descripción', 'Cant.', 'Precio unit.', 'IVA', 'Subtotal']],
    body: conceptos.map(c => [
      c.descripcion,
      Number(c.cantidad).toLocaleString('es-ES'),
      fmt(c.precio_unitario),
      `${c.iva_tasa}%`,
      fmt(c.subtotal),
    ]),
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 15 },
      4: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
    margin: { left: M, right: M },
  })

  y = doc.lastAutoTable.finalY + 6
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.4)
  doc.line(M, y, W - M, y)
  y += 8

  // Totales
  const totX = W - M - 65
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text('Subtotal:', totX, y)
  doc.text(fmt(factura.subtotal), W - M, y, { align: 'right' }); y += 7
  doc.text('IVA:', totX, y)
  doc.text(fmt(factura.iva_total), W - M, y, { align: 'right' }); y += 2
  doc.setDrawColor(r, g, b)
  doc.line(totX, y + 2, W - M, y + 2); y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(r, g, b)
  doc.text('TOTAL:', totX, y)
  doc.text(fmt(factura.total), W - M, y, { align: 'right' })

  // ── Sección inferior con más espacio ──────────────────
  y += 20

  if (factura.notas || notasDefault) {
    const notasTexto = factura.notas || notasDefault
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text('NOTAS / CONDICIONES', M, y); y += 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    const notasLines = doc.splitTextToSize(notasTexto, W - M * 2)
    doc.text(notasLines, M, y)
    y += notasLines.length * 5 + 14
  }

  if (formaPago) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text('FORMA DE PAGO', M, y); y += 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    const pagoLines = doc.splitTextToSize(formaPago, W - M * 2)
    doc.text(pagoLines, M, y)
    y += pagoLines.length * 5 + 14
  }

  if (textoPie) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text(textoPie, W / 2, y + 4, { align: 'center' })
  }
}

// ═══════════════════════════════════════════════════════
// PLANTILLA: MINIMALISTA
// ═══════════════════════════════════════════════════════
async function plantillaMinimalista(doc, { factura, empresa, conceptos, color, logoData, W, M, fmt, fmtFecha, textoPie, formaPago, notasDefault }) {
  const [r, g, b] = color.rgb
  let y = M + 5

  // Solo un punto de color: barra lateral izquierda
  doc.setFillColor(r, g, b)
  doc.rect(0, 0, 4, 297, 'F')

  // Logo
  if (logoData) {
    const { w: lw, h: lh } = logoSize(logoData, 22, 32)
    try { doc.addImage(logoData.data, 'PNG', M + 5, y, lw, lh) } catch(e) {}
    y += lh + 5
  }

  // Empresa
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(empresa?.nombre || 'Mi Empresa', M + 5, y); y += 7

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  if (empresa?.nif_cif)   { doc.text(`NIF ${empresa.nif_cif}`, M + 5, y); y += 5 }
  if (empresa?.email)     { doc.text(empresa.email, M + 5, y); y += 5 }
  if (empresa?.telefono)  { doc.text(empresa.telefono, M + 5, y); y += 5 }

  // FACTURA (derecha, grande)
  doc.setFontSize(36)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text('FACTURA', W - M, M + 15, { align: 'right' })
  doc.setFontSize(11)
  doc.setTextColor(80, 80, 80)
  doc.text(factura.folio, W - M, M + 24, { align: 'right' })
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(fmtFecha(factura.fecha_emision), W - M, M + 31, { align: 'right' })

  y = Math.max(y, M + 40) + 8

  // Línea
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.line(M + 5, y, W - M, y); y += 8

  // Cliente
  const cliente = factura.clientes
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text('PARA', M + 5, y); y += 5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 30)
  if (cliente?.nombre)  { doc.text(cliente.nombre, M + 5, y); y += 5 }
  if (cliente?.nif_cif) { doc.text(cliente.nif_cif, M + 5, y); y += 5 }
  if (cliente?.email)   { doc.text(cliente.email, M + 5, y); y += 5 }
  y += 5

  // Tabla minimalista
  autoTable(doc, {
    startY: y,
    head: [['Descripción', 'Cant.', 'P.Unit.', 'IVA', 'Importe']],
    body: conceptos.map(c => [
      c.descripcion,
      Number(c.cantidad).toLocaleString('es-ES'),
      fmt(c.precio_unitario),
      `${c.iva_tasa}%`,
      fmt(c.subtotal),
    ]),
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [r, g, b],
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: 0,
      lineColor: [255, 255, 255],
    },
    bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      1: { halign: 'right', cellWidth: 16 },
      2: { halign: 'right', cellWidth: 26 },
      3: { halign: 'right', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
    },
    margin: { left: M + 5, right: M },
  })

  y = doc.lastAutoTable.finalY + 8

  // Totales minimalistas
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Subtotal', W - M - 50, y)
  doc.text(fmt(factura.subtotal), W - M, y, { align: 'right' }); y += 6
  doc.text('IVA', W - M - 50, y)
  doc.text(fmt(factura.iva_total), W - M, y, { align: 'right' }); y += 2
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.5)
  doc.line(W - M - 55, y + 2, W - M, y + 2); y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(r, g, b)
  doc.text('Total', W - M - 50, y)
  doc.text(fmt(factura.total), W - M, y, { align: 'right' })

  if (factura.notas || notasDefault) {
    y += 14
    const notasTexto = factura.notas || notasDefault
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(doc.splitTextToSize(notasTexto, W - M * 2), M + 5, y)
    y += 12
  } else { y += 14 }

  if (formaPago) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text('FORMA DE PAGO', M + 5, y); y += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text(doc.splitTextToSize(formaPago, W - M * 2), M + 5, y)
    y += 12
  }

  if (textoPie) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text(textoPie, W / 2, y, { align: 'center' })
  }
}
