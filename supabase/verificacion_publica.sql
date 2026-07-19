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
  p_folio  text,
  p_nif    text,
  p_total  numeric,
  p_fecha  date
)
returns table (
  valido         boolean,
  folio          text,
  fecha_emision  date,
  total          numeric,
  estado         estado_factura,
  empresa_nombre text,
  hash           text
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
    f.fecha_emision,
    f.total,
    f.estado,
    e.nombre::text,
    f.hash
  from facturas f
  join empresas e on e.id = f.empresa_id
  where f.folio = p_folio
    and e.nif_cif = p_nif
    and f.fecha_emision = p_fecha
    and abs(f.total - p_total) < 0.01
  limit 1;
end;
$$;

-- Permite que cualquiera (incluso sin sesión) pueda llamar a esta
-- función concreta — no afecta al resto de tablas, que siguen
-- protegidas por RLS.
grant execute on function verificar_factura(text, text, numeric, date) to anon, authenticated;
