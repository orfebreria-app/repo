-- =====================================================
-- CADENA DE HUELLA (integridad tipo Verifactu)
-- Ejecuta esto en Supabase → SQL Editor → New Query
-- =====================================================
--
-- Qué hace:
-- Cada factura, al emitirse, calcula un "hash" (huella digital)
-- que combina sus propios datos con el hash de la factura anterior
-- de la misma empresa. Si alguien intentara modificar o borrar una
-- factura pasada, la cadena dejaría de encajar — es la misma idea
-- que exige Verifactu, montada de forma sencilla.
--
-- No sustituye la certificación oficial de Verifactu (que cuando
-- llegue julio de 2027 exigirá además comunicación en tiempo real
-- con la AEAT), pero deja la base de integridad ya construida.

create extension if not exists pgcrypto;

alter table facturas add column if not exists hash text;
alter table facturas add column if not exists hash_anterior text;
alter table empresas add column if not exists ultimo_hash text;

create or replace function sellar_factura(p_factura_id uuid)
returns text
language plpgsql
as $$
declare
  v_empresa_id  uuid;
  v_prev_hash   text;
  v_folio       text;
  v_fecha       date;
  v_total       numeric;
  v_nif_cliente text;
  v_nuevo_hash  text;
begin
  select f.empresa_id, f.folio, f.fecha_emision, f.total, c.nif_cif
    into v_empresa_id, v_folio, v_fecha, v_total, v_nif_cliente
  from facturas f
  left join clientes c on c.id = f.cliente_id
  where f.id = p_factura_id;

  if not found then
    raise exception 'Factura no encontrada o sin permiso';
  end if;

  -- Bloquea la empresa para leer y actualizar el último hash de
  -- forma atómica (mismo mecanismo que ya usamos para los folios,
  -- así dos facturas creadas a la vez no pueden calcular el mismo
  -- eslabón de la cadena).
  select ultimo_hash into v_prev_hash
  from empresas where id = v_empresa_id for update;

  v_nuevo_hash := encode(
    digest(
      coalesce(v_prev_hash, 'GENESIS') || '|' || v_folio || '|' || v_fecha::text || '|' || v_total::text || '|' || coalesce(v_nif_cliente, ''),
      'sha256'
    ),
    'hex'
  );

  update facturas set hash = v_nuevo_hash, hash_anterior = v_prev_hash where id = p_factura_id;
  update empresas set ultimo_hash = v_nuevo_hash where id = v_empresa_id;

  return v_nuevo_hash;
end;
$$;

grant execute on function sellar_factura(uuid) to authenticated;
