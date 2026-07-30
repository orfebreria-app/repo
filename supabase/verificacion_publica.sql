-- =====================================================
-- VERIFICACIÓN PÚBLICA DE FACTURAS (para el QR)
-- Ejecuta esto en Supabase → SQL Editor → New Query
-- =====================================================
--
-- Por qué una función y no una tabla/vista pública:
-- RLS en `facturas` y `empresas` solo deja ver los datos al dueño
-- (auth.uid()). Para que un tercero pueda verificar una factura
-- escaneando el QR (sin estar logueado) hace falta una vía pública,
-- pero sin abrir toda la tabla. Esta función:
--   1. Corre con permisos elevados (SECURITY DEFINER) para poder
--      leer las tablas a pesar de RLS,
--   2. Pero solo devuelve los campos justos para confirmar que la
--      factura existe y sus datos básicos coinciden — nunca datos
--      del cliente ni de otras facturas.

create or replace function verificar_factura(
  p_folio text default null,
  p_nif text default null,
  p_total numeric default null,
  p_fecha date default null,
  p_id uuid default null,
  p_empresa_id uuid default null
)
returns table (
  valido boolean,
  folio text,
  fecha_emision date,
  total numeric,
  estado text,
  empresa_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    true,
    f.folio::text,
    f.fecha_emision::date,
    f.total,
    f.estado::text,
    e.nombre::text
  from facturas f
  join empresas e on e.id = f.empresa_id
  where
    (p_folio is null or trim(coalesce(p_folio, '')) = '' or lower(trim(f.folio::text)) = lower(trim(p_folio)))
    and (p_id is null or f.id = p_id)
    and (p_empresa_id is null or f.empresa_id = p_empresa_id)
    and (p_nif is null or trim(coalesce(p_nif, '')) = '' or lower(trim(coalesce(e.nif_cif, ''))) = lower(trim(p_nif)))
    and (p_total is null or p_total = 0 or abs(f.total - p_total) < 0.01)
    and (p_fecha is null or f.fecha_emision::date = p_fecha)
  order by f.created_at desc nulls last
  limit 1;
end;
$$;

grant execute on function verificar_factura(text, text, numeric, date, uuid, uuid) to anon, authenticated;
