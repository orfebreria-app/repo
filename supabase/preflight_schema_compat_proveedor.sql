-- =====================================================
-- PREFLIGHT (solo lectura) de compatibilidad de esquema
-- Compras proveedor + stock atómico
-- =====================================================
-- Este script NO aplica migraciones ni modifica datos.
-- Ejecutar antes de desplegar cambios de aplicación.
--
-- Resultado esperado:
-- - status = 'ok'   : requisito cumplido
-- - status = 'fail' : requisito faltante (bloqueante)
-- - status = 'warn' : aviso no bloqueante (p.ej. cliente_id opcional)

begin transaction read only;

with checks as (
  -- 1) Tablas requeridas
  select
    'table'::text as check_type,
    t.table_name::text as object_name,
    true as required,
    exists (
      select 1
      from information_schema.tables x
      where x.table_schema = 'public'
        and x.table_name = t.table_name
    ) as ok,
    'Tabla base requerida por flujos de compras proveedor/stock.'::text as details
  from (values
    ('facturas_proveedor'),
    ('lineas_factura_proveedor'),
    ('vencimientos_factura_proveedor'),
    ('albaranes_proveedor'),
    ('productos'),
    ('movimientos_stock')
  ) as t(table_name)

  union all

  -- 2) Columnas requeridas (cliente_id en facturas_proveedor es opcional)
  select
    'column'::text as check_type,
    c.table_name || '.' || c.column_name as object_name,
    c.required,
    exists (
      select 1
      from information_schema.columns ic
      where ic.table_schema = 'public'
        and ic.table_name = c.table_name
        and ic.column_name = c.column_name
    ) as ok,
    c.details
  from (values
    ('facturas_proveedor', 'id', true, 'PK de factura proveedor.'),
    ('facturas_proveedor', 'empresa_id', true, 'Segmentación por empresa.'),
    ('facturas_proveedor', 'proveedor_id', true, 'Relación con proveedor.'),
    ('facturas_proveedor', 'fecha_factura', true, 'Fecha de compra proveedor.'),
    ('facturas_proveedor', 'estado', true, 'Estado del documento proveedor.'),
    ('facturas_proveedor', 'subtotal', true, 'Base imponible de compra.'),
    ('facturas_proveedor', 'iva_total', true, 'IVA total compra.'),
    ('facturas_proveedor', 'recargo_total', true, 'Compatibilidad RE: preservar recargo_total.'),
    ('facturas_proveedor', 'total', true, 'Total factura proveedor.'),
    ('facturas_proveedor', 'cliente_id', false, 'OPCIONAL: no bloquear despliegue si falta. Si se necesitara, crear migración aditiva futura separada.'),
    ('lineas_factura_proveedor', 'factura_id', true, 'Relación línea -> factura proveedor.'),
    ('lineas_factura_proveedor', 'producto_id', true, 'Relación línea -> producto.'),
    ('lineas_factura_proveedor', 'cantidad', true, 'Cantidad por línea proveedor.'),
    ('lineas_factura_proveedor', 'recargo_tasa', true, 'Compatibilidad RE: preservar recargo_tasa.'),
    ('lineas_factura_proveedor', 'recargo_importe', true, 'Compatibilidad RE: preservar recargo_importe.'),
    ('vencimientos_factura_proveedor', 'factura_id', true, 'Relación vencimiento -> factura proveedor.'),
    ('vencimientos_factura_proveedor', 'empresa_id', true, 'Segmentación por empresa en vencimientos.'),
    ('albaranes_proveedor', 'factura_id', true, 'Vínculo albarán -> factura proveedor (cuando existe).'),
    ('productos', 'stock_actual', true, 'Stock actual usado por los RPC atómicos.'),
    ('movimientos_stock', 'referencia_linea', true, 'Idempotencia por línea en movimientos.'),
    ('movimientos_stock', 'stock_anterior', true, 'Trazabilidad de stock.'),
    ('movimientos_stock', 'stock_posterior', true, 'Trazabilidad de stock.')
  ) as c(table_name, column_name, required, details)

  union all

  -- 3) Constraints mínimas esperadas
  select
    'constraint'::text as check_type,
    k.object_name,
    true as required,
    k.ok,
    k.details
  from (
    select
      'facturas_proveedor PK'::text as object_name,
      exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'facturas_proveedor'
          and c.contype = 'p'
      ) as ok,
      'Debe existir clave primaria de facturas_proveedor.'::text as details
    union all
    select
      'lineas_factura_proveedor.factura_id -> facturas_proveedor'::text,
      exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_class rt on rt.oid = c.confrelid
        join pg_namespace rn on rn.oid = rt.relnamespace
        where c.contype = 'f'
          and n.nspname = 'public'
          and t.relname = 'lineas_factura_proveedor'
          and rn.nspname = 'public'
          and rt.relname = 'facturas_proveedor'
          and exists (
            select 1
            from unnest(c.conkey) ck(attnum)
            join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
            where a.attname = 'factura_id'
          )
      ),
      'FK de líneas proveedor hacia cabecera de factura proveedor.'
    union all
    select
      'vencimientos_factura_proveedor.factura_id -> facturas_proveedor'::text,
      exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_class rt on rt.oid = c.confrelid
        join pg_namespace rn on rn.oid = rt.relnamespace
        where c.contype = 'f'
          and n.nspname = 'public'
          and t.relname = 'vencimientos_factura_proveedor'
          and rn.nspname = 'public'
          and rt.relname = 'facturas_proveedor'
          and exists (
            select 1
            from unnest(c.conkey) ck(attnum)
            join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
            where a.attname = 'factura_id'
          )
      ),
      'FK de vencimientos proveedor hacia factura proveedor.'
    union all
    select
      'movimientos_stock.producto_id -> productos'::text,
      exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_class rt on rt.oid = c.confrelid
        join pg_namespace rn on rn.oid = rt.relnamespace
        where c.contype = 'f'
          and n.nspname = 'public'
          and t.relname = 'movimientos_stock'
          and rn.nspname = 'public'
          and rt.relname = 'productos'
          and exists (
            select 1
            from unnest(c.conkey) ck(attnum)
            join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
            where a.attname = 'producto_id'
          )
      ),
      'FK de movimientos de stock hacia productos.'
  ) as k

  union all

  -- 4) RLS habilitado
  select
    'rls'::text as check_type,
    r.table_name as object_name,
    true as required,
    exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = r.table_name
        and c.relrowsecurity
    ) as ok,
    'RLS debe estar habilitado en tabla con datos de negocio.'::text as details
  from (values
    ('facturas_proveedor'),
    ('lineas_factura_proveedor'),
    ('vencimientos_factura_proveedor'),
    ('albaranes_proveedor'),
    ('productos'),
    ('movimientos_stock')
  ) as r(table_name)

  union all

  -- 5) Al menos una policy por tabla
  select
    'policy'::text as check_type,
    p.table_name as object_name,
    true as required,
    exists (
      select 1
      from pg_policies pol
      where pol.schemaname = 'public'
        and pol.tablename = p.table_name
    ) as ok,
    'Debe existir al menos una policy RLS en la tabla.'::text as details
  from (values
    ('facturas_proveedor'),
    ('lineas_factura_proveedor'),
    ('vencimientos_factura_proveedor'),
    ('albaranes_proveedor'),
    ('productos'),
    ('movimientos_stock')
  ) as p(table_name)

  union all

  -- 6) Triggers esperados para timestamp automático
  select
    'trigger'::text as check_type,
    x.object_name,
    true as required,
    x.ok,
    x.details
  from (
    select
      'facturas_proveedor -> update_actualizado_en()'::text as object_name,
      exists (
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal
          and n.nspname = 'public'
          and c.relname = 'facturas_proveedor'
          and p.proname = 'update_actualizado_en'
      ) as ok,
      'Trigger BEFORE UPDATE para mantener actualizado_en en facturas_proveedor.'::text as details
    union all
    select
      'productos -> update_actualizado_en()'::text as object_name,
      exists (
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal
          and n.nspname = 'public'
          and c.relname = 'productos'
          and p.proname = 'update_actualizado_en'
      ) as ok,
      'Trigger BEFORE UPDATE para mantener actualizado_en en productos.'::text as details
  ) as x
)
select
  check_type,
  object_name,
  case
    when ok then 'ok'
    when required then 'fail'
    else 'warn'
  end as status,
  required,
  details
from checks
order by
  case
    when ok then 2
    when required then 0
    else 1
  end,
  check_type,
  object_name;

commit;
