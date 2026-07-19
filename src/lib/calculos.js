// ── Cálculos de facturación ───────────────────────────
// Funciones puras (sin efectos secundarios, sin llamadas a red) para
// poder testearlas de forma aislada. Si alguna vez cambia cómo se
// calcula el IVA o el recargo de equivalencia, este es el único
// sitio que hay que tocar — antes esta lógica estaba duplicada
// (con pequeñas diferencias) en varias pantallas.

export const RE_TASAS = { 21: 5.2, 10: 1.4, 4: 0.5, 0: 0 }

// Tasa de recargo de equivalencia correspondiente a una tasa de IVA
export const tasaRE = (ivaTasa) => RE_TASAS[Number(ivaTasa)] ?? 0

// Base imponible de una línea, aplicando descuento si lo hay
export const calcLinea = (linea) => {
  const base = Number(linea.cantidad) * Number(linea.precio_unitario || 0)
  const descuento = base * (Number(linea.descuento || 0) / 100)
  return +(base - descuento).toFixed(2)
}

// Cuota de IVA de una línea
export const calcIvaLinea = (linea) => {
  const base = calcLinea(linea)
  return +(base * (Number(linea.iva_tasa) / 100)).toFixed(2)
}

// Cuota de recargo de equivalencia de una línea
export const calcRecargoLinea = (linea) => {
  const base = calcLinea(linea)
  return +(base * tasaRE(linea.iva_tasa) / 100).toFixed(2)
}

// Agrupa líneas (de facturas o de compras) por tasa de IVA, sumando
// base, cuota y recargo de equivalencia — es el desglose que pide
// un informe de IVA trimestral.
export const agruparPorIva = (lineas) => {
  const grupos = {}
  for (const l of lineas) {
    const tasa = Number(l.iva_tasa)
    if (!grupos[tasa]) grupos[tasa] = { tasa, base: 0, cuota: 0, recargo: 0 }
    const base = Number(l.subtotal || 0)
    grupos[tasa].base   += base
    grupos[tasa].cuota  += +(base * tasa / 100).toFixed(2)
    grupos[tasa].recargo += Number(l.recargo_importe || 0)
  }
  return Object.values(grupos)
    .sort((a, b) => b.tasa - a.tasa)
    .map(g => ({ tasa: g.tasa, base: +g.base.toFixed(2), cuota: +g.cuota.toFixed(2), recargo: +g.recargo.toFixed(2) }))
}
// Totales de la factura completa a partir de sus líneas.
// clienteConRE: true si el cliente está sujeto a recargo de equivalencia.
export const calcularTotalesFactura = (lineas, clienteConRE = false) => {
  const subtotal = lineas.reduce((s, l) => s + calcLinea(l), 0)
  const ivaTotal  = lineas.reduce((s, l) => s + calcIvaLinea(l), 0)
  const reTotal   = clienteConRE ? lineas.reduce((s, l) => s + calcRecargoLinea(l), 0) : 0
  const total     = +(subtotal + ivaTotal + reTotal).toFixed(2)
  return {
    subtotal: +subtotal.toFixed(2),
    ivaTotal: +ivaTotal.toFixed(2),
    reTotal:  +reTotal.toFixed(2),
    total,
  }
}
