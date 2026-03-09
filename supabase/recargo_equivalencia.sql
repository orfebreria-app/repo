-- =====================================================
-- RECARGO DE EQUIVALENCIA
-- Ejecuta en Supabase: SQL Editor > New Query > Run
-- =====================================================

-- Flag en clientes y proveedores
ALTER TABLE clientes    ADD COLUMN IF NOT EXISTS recargo_equivalencia boolean default false;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS recargo_equivalencia boolean default false;

-- Columnas RE en líneas de factura (clientes)
ALTER TABLE conceptos_factura ADD COLUMN IF NOT EXISTS recargo_tasa    decimal(5,2) default 0;
ALTER TABLE conceptos_factura ADD COLUMN IF NOT EXISTS recargo_importe decimal(12,2) default 0;

-- Columnas RE en líneas de ticket
ALTER TABLE lineas_ticket ADD COLUMN IF NOT EXISTS recargo_tasa    decimal(5,2) default 0;
ALTER TABLE lineas_ticket ADD COLUMN IF NOT EXISTS recargo_importe decimal(12,2) default 0;

-- Columnas RE en líneas de compras proveedor
ALTER TABLE lineas_factura_proveedor ADD COLUMN IF NOT EXISTS recargo_tasa    decimal(5,2) default 0;
ALTER TABLE lineas_factura_proveedor ADD COLUMN IF NOT EXISTS recargo_importe decimal(12,2) default 0;

-- Columna RE total en cabecera facturas y compras
ALTER TABLE facturas            ADD COLUMN IF NOT EXISTS recargo_total decimal(12,2) default 0;
ALTER TABLE facturas_proveedor  ADD COLUMN IF NOT EXISTS recargo_total decimal(12,2) default 0;
ALTER TABLE tickets             ADD COLUMN IF NOT EXISTS recargo_total decimal(12,2) default 0;

-- Código postal en clientes y proveedores (si no existe)
ALTER TABLE clientes    ADD COLUMN IF NOT EXISTS cp varchar(10) default '';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cp varchar(10) default '';
