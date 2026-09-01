-- Migración idempotente: añade descuento_porcentaje a lineas_factura_proveedor
-- Ejecutar en Supabase: SQL Editor > New Query > Run
-- Es seguro ejecutarlo varias veces (ADD COLUMN IF NOT EXISTS).

alter table lineas_factura_proveedor
  add column if not exists descuento_porcentaje numeric(5,2) not null default 0;

comment on column lineas_factura_proveedor.descuento_porcentaje is
  'Descuento aplicado a la línea en porcentaje (0-100). Afecta solo al coste '
  'facturado. El precio de venta se calcula siempre sobre precio_unitario_base '
  'sin descuento, conforme a la regla comercial del sistema.';
