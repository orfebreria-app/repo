import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const fmt      = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const loadImage = (url) =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve({ data: canvas.toDataURL('image/png'), w: img.width, h: img.height })
    }
    img.onerror = () => resolve(null)
    img.src = url
  })

const logoSize = (img, maxW, maxH) => {
  if (!img) return { w: 0, h: 0 }
  const ratio = img.w / img.h
  let w = maxW, h = maxW / ratio
  if (h > maxH) { h = maxH; w = maxH * ratio }
  return { w: +w.toFixed(1), h: +h.toFixed(1) }
}

// config = presupuesto_config de la empresa
export async function generarPresupuestoPDF({ presupuesto, empresa, conceptos }) {
  const cfg = empresa?.presupuesto_config || {}
  const colorHex = cfg.color || '#1D4ED8'
  const rgb = hexToRgb(colorHex)
  const plantilla = cfg.plantilla || 'moderna'
  const titulo = cfg.titulo || 'PRESUPUESTO'
  const textoValidez = cfg.textoValidez || 'Este presupuesto tiene una validez de 30 días.'
  const textoPie = cfg.textoPie || '¡Gracias por confiar en nosotros!'
  const condicionesDefault = cfg.condiciones || ''

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const W = 210, M = 15

  let logoData = null
  if (empresa?.logo_url) logoData = await loadImage(empresa.logo_url)

  if (plantilla === 'clasica') {
    await plantillaClasica(doc, { presupuesto, empresa, conceptos, rgb, logoData, W, M, fmt, fmtFecha, titulo, textoValidez, textoPie, condicionesDefault })
  } else if (plantilla === 'minimalista') {
    await plantillaMinimalista(doc, { presupuesto, empresa, conceptos, rgb, logoData, W, M, fmt, fmtFecha, titulo, textoValidez, textoPie, condicionesDefault })
  } else {
    await plantillaModerna(doc, { presupuesto, empresa, conceptos, rgb, logoData, W, M, fmt, fmtFecha, titulo, textoValidez, textoPie, condicionesDefault })
  }

  // Pie de página
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(160, 160, 160)
    doc.text(`Página ${i} de ${pages}`, W / 2, 290, { align: 'center' })
    if (empresa?.nombre) doc.text(empresa.nombre, M, 290)
  }

  return doc
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return [r, g, b]
}

// ═══════════════════════════════════════════════════
// PLANTILLA MODERNA
// ═══════════════════════════════════════════════════
async function plantillaModerna(doc, { presupuesto, empresa, conceptos, rgb, logoData, W, M, fmt, fmtFecha, titulo, textoValidez, textoPie, condicionesDefault }) {
  const [r,g,b] = rgb

  // Cabecera color
  doc.setFillColor(r,g,b)
  doc.rect(0, 0, W, 45, 'F')

  if (logoData) {
    const { w: lw, h: lh } = logoSize(logoData, 25, 38)
    try { doc.addImage(logoData.data, 'PNG', M, 3, lw, lh) } catch(e){}
  }

  doc.setTextColor(255,255,255)
  doc.setFontSize(20); doc.setFont('helvetica','bold')
  const nx = logoData ? M+28 : M
  doc.text(empresa?.nombre || 'Mi Empresa', nx, 20)
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  if (empresa?.nif_cif)   doc.text(`NIF/CIF: ${empresa.nif_cif}`, nx, 27)
  if (empresa?.direccion) doc.text(empresa.direccion, nx, 33)
  if (empresa?.email)     doc.text(empresa.email, nx, 39)

  doc.setFontSize(26); doc.setFont('helvetica','bold')
  doc.text(titulo, W-M, 22, { align:'right' })
  doc.setFontSize(12)
  doc.text(presupuesto.numero, W-M, 32, { align:'right' })

  doc.setTextColor(30,30,30)
  let y = 55

  // Bloque datos + cliente
  doc.setFillColor(248,249,250)
  doc.roundedRect(M, y, W-M*2, 32, 2, 2, 'F')

  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
  doc.text('DATOS DEL PRESUPUESTO', M+5, y+7)
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30)
  doc.text(`Número: ${presupuesto.numero}`, M+5, y+14)
  doc.text(`Fecha: ${fmtFecha(presupuesto.fecha_emision)}`, M+5, y+20)
  doc.text(`Válido hasta: ${fmtFecha(presupuesto.fecha_validez)}`, M+5, y+26)

  const cx = W/2+5
  const cliente = presupuesto.clientes
  doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
  doc.text('PRESUPUESTO PARA', cx, y+7)
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30)
  if (cliente?.nombre)   doc.text(cliente.nombre, cx, y+14)
  if (cliente?.nif_cif)  doc.text(`NIF/CIF: ${cliente.nif_cif}`, cx, y+20)
  if (cliente?.email)    doc.text(cliente.email, cx, y+26)

  y += 40

  autoTable(doc, {
    startY: y,
    head: [['Descripción','Cant.','Precio unit.','IVA','Dto.','Importe']],
    body: conceptos.map(c => {
      const dto = Number(c.descuento || 0)
      const base = +(Number(c.cantidad) * Number(c.precio_unitario)).toFixed(2)
      const importe = +(base * (1 - dto / 100)).toFixed(2)
      return [
        c.descripcion,
        Number(c.cantidad).toLocaleString('es-ES'),
        fmt(c.precio_unitario),
        `${c.iva_tasa}%`,
        dto > 0 ? `${dto}%` : '—',
        fmt(importe),
      ]
    }),
    headStyles: { fillColor:[r,g,b], textColor:255, fontStyle:'bold', fontSize:9 },
    bodyStyles: { fontSize:9, textColor:[30,30,30] },
    alternateRowStyles: { fillColor:[248,249,250] },
    columnStyles: {
      1:{halign:'right',cellWidth:18}, 2:{halign:'right',cellWidth:28},
      3:{halign:'right',cellWidth:15}, 4:{halign:'right',cellWidth:15},
      5:{halign:'right',cellWidth:28,fontStyle:'bold'},
    },
    margin:{left:M,right:M},
  })
  y = doc.lastAutoTable.finalY + 8

  // Totales
  const totW=70, totX=W-M-totW
  doc.setFillColor(248,249,250)
  doc.roundedRect(totX, y, totW, 32, 2, 2, 'F')
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
  doc.text('Subtotal:', totX+5, y+9)
  doc.text('IVA:', totX+5, y+17)
  doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
  doc.text('TOTAL:', totX+5, y+26)
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30)
  doc.text(fmt(presupuesto.subtotal), totX+totW-5, y+9, {align:'right'})
  doc.text(fmt(presupuesto.iva_total), totX+totW-5, y+17, {align:'right'})
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(r,g,b)
  doc.text(fmt(presupuesto.total), totX+totW-5, y+26, {align:'right'})

  y += 40

  // Condiciones y validez
  const condiciones = presupuesto.condiciones || condicionesDefault
  if (condiciones) {
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
    doc.text('CONDICIONES', M, y); y+=5
    doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
    doc.text(doc.splitTextToSize(condiciones, W-M*2), M, y)
    y += doc.splitTextToSize(condiciones, W-M*2).length * 4 + 4
  }

  if (textoValidez) {
    doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.setTextColor(120,120,120)
    doc.text(textoValidez, M, y); y+=6
  }

  if (presupuesto.notas) {
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
    doc.text('NOTAS', M, y); y+=5
    doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
    doc.text(doc.splitTextToSize(presupuesto.notas, W-M*2), M, y)
    y += 10
  }

  if (textoPie) {
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
    doc.text(textoPie, W/2, y+6, {align:'center'})
  }
}

// ═══════════════════════════════════════════════════
// PLANTILLA CLASICA
// ═══════════════════════════════════════════════════
async function plantillaClasica(doc, { presupuesto, empresa, conceptos, rgb, logoData, W, M, fmt, fmtFecha, titulo, textoValidez, textoPie, condicionesDefault }) {
  const [r,g,b] = rgb
  let y = M

  if (logoData) {
    const { w: lw, h: lh } = logoSize(logoData, 25, 35)
    try { doc.addImage(logoData.data,'PNG',M,y,lw,lh) } catch(e){}
  }
  const ex = logoData ? M+28 : M
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
  doc.text(empresa?.nombre||'Mi Empresa', ex, y+10)
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
  let iy=y+16
  if (empresa?.nif_cif)   { doc.text(`NIF/CIF: ${empresa.nif_cif}`,ex,iy); iy+=5 }
  if (empresa?.direccion) { doc.text(empresa.direccion,ex,iy); iy+=5 }
  if (empresa?.email)     { doc.text(empresa.email,ex,iy) }

  doc.setFontSize(22); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30)
  doc.text(titulo, W-M, y+10, {align:'right'})
  doc.setFontSize(10); doc.setTextColor(r,g,b)
  doc.text(presupuesto.numero, W-M, y+18, {align:'right'})

  y=45
  doc.setDrawColor(r,g,b); doc.setLineWidth(0.8)
  doc.line(M,y,W-M,y); y+=8

  const col2=W/2+5
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
  doc.text('DETALLES', M, y); y+=5
  doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50)
  doc.text(`Número: ${presupuesto.numero}`, M, y); y+=5
  doc.text(`Fecha: ${fmtFecha(presupuesto.fecha_emision)}`, M, y); y+=5
  doc.text(`Válido hasta: ${fmtFecha(presupuesto.fecha_validez)}`, M, y)

  let cy=53
  doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
  doc.text('PARA', col2, cy); cy+=5
  doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50)
  const cl=presupuesto.clientes
  if (cl?.nombre)  { doc.text(cl.nombre,col2,cy); cy+=5 }
  if (cl?.nif_cif) { doc.text(`NIF/CIF: ${cl.nif_cif}`,col2,cy); cy+=5 }
  if (cl?.email)   { doc.text(cl.email,col2,cy) }

  y=Math.max(y,cy)+10
  doc.setDrawColor(200,200,200); doc.setLineWidth(0.3)
  doc.line(M,y,W-M,y); y+=5

  autoTable(doc, {
    startY:y,
    head:[['Descripción','Cant.','Precio unit.','IVA','Dto.','Importe']],
    body:conceptos.map(c=>{
      const dto = Number(c.descuento||0)
      const base = +(Number(c.cantidad)*Number(c.precio_unitario)).toFixed(2)
      const importe = +(base*(1-dto/100)).toFixed(2)
      return [c.descripcion,Number(c.cantidad).toLocaleString('es-ES'),fmt(c.precio_unitario),`${c.iva_tasa}%`,dto>0?`${dto}%`:'—',fmt(importe)]
    }),
    headStyles:{fillColor:[r,g,b],textColor:255,fontStyle:'bold',fontSize:9},
    bodyStyles:{fontSize:9},
    columnStyles:{1:{halign:'right',cellWidth:16},2:{halign:'right',cellWidth:26},3:{halign:'right',cellWidth:13},4:{halign:'right',cellWidth:13},5:{halign:'right',cellWidth:26,fontStyle:'bold'}},
    margin:{left:M,right:M},
  })

  y=doc.lastAutoTable.finalY+6
  doc.setDrawColor(r,g,b); doc.setLineWidth(0.4)
  doc.line(M,y,W-M,y); y+=8

  const totX=W-M-65
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
  doc.text('Subtotal:', totX, y); doc.text(fmt(presupuesto.subtotal),W-M,y,{align:'right'}); y+=7
  doc.text('IVA:', totX, y); doc.text(fmt(presupuesto.iva_total),W-M,y,{align:'right'}); y+=2
  doc.setDrawColor(r,g,b); doc.line(totX,y+2,W-M,y+2); y+=6
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(r,g,b)
  doc.text('TOTAL:', totX, y); doc.text(fmt(presupuesto.total),W-M,y,{align:'right'})
  y+=14

  const condiciones = presupuesto.condiciones || condicionesDefault
  if (condiciones) {
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
    doc.text('CONDICIONES', M, y); y+=5
    doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
    doc.text(doc.splitTextToSize(condiciones, W-M*2), M, y)
    y += doc.splitTextToSize(condiciones, W-M*2).length * 4 + 4
  }
  if (textoValidez) { doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.setTextColor(130,130,130); doc.text(textoValidez,M,y) }
  if (textoPie) { doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b); doc.text(textoPie,W/2,y+12,{align:'center'}) }
}

// ═══════════════════════════════════════════════════
// PLANTILLA MINIMALISTA
// ═══════════════════════════════════════════════════
async function plantillaMinimalista(doc, { presupuesto, empresa, conceptos, rgb, logoData, W, M, fmt, fmtFecha, titulo, textoValidez, textoPie, condicionesDefault }) {
  const [r,g,b] = rgb
  doc.setFillColor(r,g,b); doc.rect(0,0,4,297,'F')
  let y=M+5
  if (logoData) {
    const { w: lw, h: lh } = logoSize(logoData, 22, 32)
    try { doc.addImage(logoData.data,'PNG',M+5,y,lw,lh) } catch(e){}
    y += lh + 5
  }
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,20)
  doc.text(empresa?.nombre||'Mi Empresa',M+5,y); y+=7
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120)
  if (empresa?.nif_cif)   { doc.text(`NIF ${empresa.nif_cif}`,M+5,y); y+=5 }
  if (empresa?.email)     { doc.text(empresa.email,M+5,y); y+=5 }

  doc.setFontSize(32); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
  doc.text(titulo, W-M, M+15, {align:'right'})
  doc.setFontSize(11); doc.setTextColor(80,80,80)
  doc.text(presupuesto.numero, W-M, M+24, {align:'right'})
  doc.setFontSize(8); doc.setTextColor(150,150,150)
  doc.text(fmtFecha(presupuesto.fecha_emision), W-M, M+31, {align:'right'})

  y=Math.max(y,M+40)+8
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3)
  doc.line(M+5,y,W-M,y); y+=8

  const cl=presupuesto.clientes
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b)
  doc.text('PARA', M+5, y); y+=5
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30)
  if (cl?.nombre)  { doc.text(cl.nombre,M+5,y); y+=5 }
  if (cl?.nif_cif) { doc.text(cl.nif_cif,M+5,y); y+=5 }
  if (cl?.email)   { doc.text(cl.email,M+5,y); y+=5 }
  y+=5

  autoTable(doc, {
    startY:y,
    head:[['Descripción','Cant.','P.Unit.','IVA','Dto.','Importe']],
    body:conceptos.map(c=>{
      const dto = Number(c.descuento||0)
      const base = +(Number(c.cantidad)*Number(c.precio_unitario)).toFixed(2)
      const importe = +(base*(1-dto/100)).toFixed(2)
      return [c.descripcion,Number(c.cantidad).toLocaleString('es-ES'),fmt(c.precio_unitario),`${c.iva_tasa}%`,dto>0?`${dto}%`:'—',fmt(importe)]
    }),
    headStyles:{fillColor:[255,255,255],textColor:[r,g,b],fontStyle:'bold',fontSize:8,lineWidth:0},
    bodyStyles:{fontSize:9,textColor:[40,40,40]},
    columnStyles:{1:{halign:'right',cellWidth:14},2:{halign:'right',cellWidth:24},3:{halign:'right',cellWidth:12},4:{halign:'right',cellWidth:12},5:{halign:'right',cellWidth:24,fontStyle:'bold'}},
    margin:{left:M+5,right:M},
  })

  y=doc.lastAutoTable.finalY+8
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120)
  doc.text('Subtotal',W-M-50,y); doc.text(fmt(presupuesto.subtotal),W-M,y,{align:'right'}); y+=6
  doc.text('IVA',W-M-50,y); doc.text(fmt(presupuesto.iva_total),W-M,y,{align:'right'}); y+=2
  doc.setDrawColor(r,g,b); doc.setLineWidth(0.5); doc.line(W-M-55,y+2,W-M,y+2); y+=8
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(r,g,b)
  doc.text('Total',W-M-50,y); doc.text(fmt(presupuesto.total),W-M,y,{align:'right'})
  y+=14

  const condiciones = presupuesto.condiciones || condicionesDefault
  if (condiciones) {
    doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(130,130,130)
    doc.text(doc.splitTextToSize(condiciones, W-M*2), M+5, y)
    y += doc.splitTextToSize(condiciones, W-M*2).length * 4 + 4
  }
  if (textoValidez) { doc.setFontSize(7.5); doc.setFont('helvetica','italic'); doc.setTextColor(150,150,150); doc.text(textoValidez,M+5,y); y+=8 }
  if (textoPie) { doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(r,g,b); doc.text(textoPie,W/2,y,{align:'center'}) }
}
