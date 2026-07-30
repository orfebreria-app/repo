// ── Verificación de facturas por QR ──────────────────────────────
// Construye la URL que se codifica en el QR de cada factura.
// Por defecto apunta a la propia app (ruta pública /verificar), así
// que funciona "de fábrica" sin tener que configurar nada.
//
// factura_config.verification_url sigue existiendo como override
// opcional para quien quiera usar un dominio propio de verificación
// (ej. un subdominio dedicado), pero YA NO es obligatorio rellenarlo
// para que el QR funcione.

const getPublicOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  if (import.meta?.env?.VITE_PUBLIC_SITE_URL) {
    return import.meta.env.VITE_PUBLIC_SITE_URL
  }

  return ''
}

const normalizeVerificationBase = (value, publicOrigin = getPublicOrigin()) => {
  if (!value) {
    return publicOrigin ? `${publicOrigin.replace(/\/$/, '')}/verificar` : '/verificar'
  }

  const normalized = String(value).trim()
  if (!normalized) {
    return publicOrigin ? `${publicOrigin.replace(/\/$/, '')}/verificar` : '/verificar'
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized.replace(/\/$/, '')
  }

  if (normalized.startsWith('/')) {
    return publicOrigin ? `${publicOrigin.replace(/\/$/, '')}${normalized}` : normalized
  }

  return `https://${normalized.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
}

export function buildVerificationUrl({ empresa, factura }) {
  if (!empresa || !factura) return null

  const publicOrigin = getPublicOrigin()
  const configuredBase = empresa?.factura_config?.verification_url || import.meta.env?.VITE_PUBLIC_VERIFICATION_URL || ''
  const base = normalizeVerificationBase(configuredBase || (publicOrigin ? `${publicOrigin}/verificar` : '/verificar'), publicOrigin)
  const finalBase = base.endsWith('/verificar') ? base : `${base}/verificar`

  const params = new URLSearchParams({
    folio: factura?.folio || factura?.id || '',
    id: factura?.id || '',
    empresa_id: factura?.empresa_id || empresa?.id || '',
    nif: empresa?.nif_cif || empresa?.nif || empresa?.cif || '',
    total: Number(factura?.total || 0).toFixed(2),
    fecha: factura?.fecha_emision ? String(factura.fecha_emision).slice(0, 10) : '',
  })

  // Nota: a propósito NO incluimos el NIF/nombre del cliente en la URL.
  // El QR es público (cualquiera que lo escanee lo ve), así que no debe
  // llevar datos personales del comprador.
  return `${finalBase}?${params.toString()}`
}
