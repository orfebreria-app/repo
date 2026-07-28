-- Función para reservar el siguiente folio de forma atómica.
-- Devuelve un texto tipo FAC-0001 y actualiza el contador en empresas.
create or replace function siguiente_folio_atomico(p_empresa_id uuid)
returns text
language plpgsql
as $$
declare
  v_serie varchar(10);
  v_siguiente integer;
  v_folio text;
begin
  select coalesce(serie, 'FAC'), coalesce(siguiente_folio, 1)
    into v_serie, v_siguiente
  from empresas
  where id = p_empresa_id
  for update;

  if not found then
    raise exception 'Empresa % no encontrada', p_empresa_id;
  end if;

  v_folio := trim(both '-' from coalesce(v_serie, 'FAC')) || '-' || lpad(v_siguiente::text, 4, '0');

  update empresas
  set siguiente_folio = v_siguiente + 1
  where id = p_empresa_id;

  return v_folio;
end;
$$;
