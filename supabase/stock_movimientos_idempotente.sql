-- =====================================================
-- Servicio robusto de movimientos de stock (idempotente)
-- =====================================================

alter table movimientos_stock
  alter column referencia_tipo type varchar(64);

alter table movimientos_stock
  add column if not exists referencia_linea text;

alter table movimientos_stock
  alter column referencia_linea set default '';

drop index if exists ux_movimientos_stock_idempotencia;

-- Idempotencia explícita para flujos documentales.
-- Los ajustes manuales no participan en esta clave para no bloquear
-- ajustes legítimos cuando referencia_id sea null o no se use.
create unique index if not exists ux_movimientos_stock_idempotencia
  on movimientos_stock (
    empresa_id,
    referencia_tipo,
    referencia_id,
    referencia_linea,
    producto_id,
    tipo
  )
  where referencia_id is not null
    and coalesce(referencia_tipo, '') <> 'manual';

create index if not exists idx_movimientos_stock_referencia
  on movimientos_stock (empresa_id, referencia_tipo, referencia_id);

create or replace function registrar_movimiento_stock(
  p_empresa_id uuid,
  p_producto_id uuid,
  p_tipo varchar,
  p_cantidad numeric,
  p_referencia_tipo varchar,
  p_referencia_id uuid,
  p_referencia_linea text default null,
  p_notas text default null,
  p_permitir_stock_negativo boolean default false
)
returns table (
  aplicado boolean,
  movimiento_id uuid,
  stock_anterior numeric,
  stock_posterior numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movimiento_id uuid;
  v_stock_anterior numeric;
  v_stock_posterior numeric;
begin
  select p.stock_actual
    into v_stock_anterior
  from productos p
  where p.id = p_producto_id
    and p.empresa_id = p_empresa_id
  for update;

  if v_stock_anterior is null then
    raise exception 'Producto % no encontrado para empresa %', p_producto_id, p_empresa_id;
  end if;

  v_stock_posterior := coalesce(v_stock_anterior, 0) + coalesce(p_cantidad, 0);

  if not p_permitir_stock_negativo and v_stock_posterior < 0 then
    raise exception 'Stock insuficiente para producto % (anterior %, cambio %, posterior %)',
      p_producto_id, v_stock_anterior, p_cantidad, v_stock_posterior;
  end if;

  insert into movimientos_stock (
    empresa_id, producto_id, tipo, cantidad,
    stock_anterior, stock_posterior,
    referencia_tipo, referencia_id, referencia_linea, notas
  ) values (
    p_empresa_id, p_producto_id, p_tipo, p_cantidad,
    v_stock_anterior, v_stock_posterior,
    p_referencia_tipo, p_referencia_id, coalesce(p_referencia_linea, ''), p_notas
  )
  on conflict (empresa_id, referencia_tipo, referencia_id, referencia_linea, producto_id, tipo)
  where referencia_id is not null
    and coalesce(referencia_tipo, '') <> 'manual'
  do nothing
  returning id, movimientos_stock.stock_anterior, movimientos_stock.stock_posterior
  into v_movimiento_id, v_stock_anterior, v_stock_posterior;

  if v_movimiento_id is not null then
    update productos
    set stock_actual = v_stock_posterior
    where id = p_producto_id
      and empresa_id = p_empresa_id;

    return query
    select true, v_movimiento_id, v_stock_anterior, v_stock_posterior;
    return;
  else
    select m.id, m.stock_anterior, m.stock_posterior
      into v_movimiento_id, v_stock_anterior, v_stock_posterior
    from movimientos_stock m
    where m.empresa_id = p_empresa_id
      and m.referencia_tipo = p_referencia_tipo
      and m.referencia_id = p_referencia_id
      and coalesce(m.referencia_linea, '') = coalesce(p_referencia_linea, '')
      and m.producto_id = p_producto_id
      and m.tipo = p_tipo
    limit 1;

    return query
    select false, v_movimiento_id, v_stock_anterior, v_stock_posterior;
    return;
  end if;
end;
$$;

grant execute on function registrar_movimiento_stock(
  uuid, uuid, varchar, numeric, varchar, uuid, text, text, boolean
) to authenticated;

create or replace function ajustar_stock_manual(
  p_empresa_id uuid,
  p_producto_id uuid,
  p_nuevo_stock numeric,
  p_notas text default null
)
returns table (
  aplicado boolean,
  movimiento_id uuid,
  stock_anterior numeric,
  stock_posterior numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_anterior numeric;
  v_delta numeric;
  v_tipo varchar;
  v_movimiento_id uuid;
begin
  select p.stock_actual
    into v_stock_anterior
  from productos p
  where p.id = p_producto_id
    and p.empresa_id = p_empresa_id
  for update;

  if v_stock_anterior is null then
    raise exception 'Producto % no encontrado para empresa %', p_producto_id, p_empresa_id;
  end if;

  if p_nuevo_stock < 0 then
    raise exception 'No se permite stock negativo para producto %', p_producto_id;
  end if;

  v_delta := p_nuevo_stock - v_stock_anterior;
  if v_delta = 0 then
    return query select false, null::uuid, v_stock_anterior, p_nuevo_stock;
    return;
  end if;

  v_tipo := case when v_delta > 0 then 'ajuste_positivo' else 'ajuste_negativo' end;

  update productos
  set stock_actual = p_nuevo_stock
  where id = p_producto_id
    and empresa_id = p_empresa_id;

  insert into movimientos_stock (
    empresa_id, producto_id, tipo, cantidad,
    stock_anterior, stock_posterior,
    referencia_tipo, referencia_id, referencia_linea, notas
  ) values (
    p_empresa_id, p_producto_id, v_tipo, v_delta,
    v_stock_anterior, p_nuevo_stock,
    'manual', null, '', coalesce(p_notas, 'Ajuste manual')
  )
  returning id into v_movimiento_id;

  return query select true, v_movimiento_id, v_stock_anterior, p_nuevo_stock;
end;
$$;

grant execute on function ajustar_stock_manual(
  uuid, uuid, numeric, text
) to authenticated;
