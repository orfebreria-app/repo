// ── Verificación de facturas por QR ──────────────────────────────
// Construye la URL que se codifica en el QR de cada factura.
// Por defecto apunta a la propia app (ruta pública /verificar), así
// que funciona "de fábrica" sin tener que configurar nada.
//
// factura_config.verification_url sigue existiendo como override
// opcional para quien quiera usar un dominio propio de verificación
// (ej. un subdominio dedicado), pero YA NO es obligatorio rellenarlo
// para que el QR funcione.

export function buildVerificationUrl({ empresa, factura }) {
  if (!empresa?.factura_config?.electronica_habilitada) return null

  const base = (empresa.factura_config?.verification_url || `${window.location.origin}/verificar`)
    .replace(/\/$/, '')

  const params = new URLSearchParams({
    folio: factura.folio || factura.id || '',
    nif:   empresa.nif_cif || '',
    total: Number(factura.total || 0).toFixed(2),
    fecha: factura.fecha_emision || '',
  })

  // Nota: a propósito NO incluimos el NIF/nombre del cliente en la URL.
  // El QR es público (cualquiera que lo escanee lo ve), así que no debe
  // llevar datos personales del comprador.
  return `${base}?${params.toString()}`
}
