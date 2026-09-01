-- =====================================================
-- RPCs transaccionales para documentos con stock
-- Ejecutar DESPUÉS de:
--   1) schema.sql
--   2) stock.sql
--   3) recargo_equivalencia.sql
--   4) lineas_factura_proveedor_descuento.sql
--   5) stock_movimientos_idempotente.sql
-- =====================================================

create or replace function lock_productos_documento(
  p_empresa_id uuid,
  p_lineas jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from productos p
  where p.empresa_id = p_empresa_id
    and p.id in (
      select distinct nullif(l.value->>'producto_id', '')::uuid
      from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) as l(value)
      where coalesce(l.value->>'producto_id', '') <> ''
    )
  order by p.id
  for update;
end;
$$;

create or replace function calcular_deltas_stock_lineas(
  p_lineas_antes jsonb,
  p_lineas_despues jsonb,
  p_modo text
)
returns table (
  producto_id uuid,
  cantidad_antes numeric,
  cantidad_despues numeric,
  delta numeric
)
language sql
security definer
set search_path = public
as $$
  with antes as (
    select
      nullif(value->>'producto_id', '')::uuid as producto_id,
      sum(coalesce(nullif(value->>'cantidad', '')::numeric, 0)) as cantidad
    from jsonb_array_elements(coalesce(p_lineas_antes, '[]'::jsonb))
    where coalesce(value->>'producto_id', '') <> ''
    group by 1
  ),
  despues as (
    select
      nullif(value->>'producto_id', '')::uuid as producto_id,
      sum(coalesce(nullif(value->>'cantidad', '')::numeric, 0)) as cantidad
    from jsonb_array_elements(coalesce(p_lineas_despues, '[]'::jsonb))
    where coalesce(value->>'producto_id', '') <> ''
    group by 1
  )
  select
    coalesce(a.producto_id, d.producto_id) as producto_id,
    coalesce(a.cantidad, 0) as cantidad_antes,
    coalesce(d.cantidad, 0) as cantidad_despues,
    case
      when p_modo = 'compra' then coalesce(d.cantidad, 0) - coalesce(a.cantidad, 0)
      else coalesce(a.cantidad, 0) - coalesce(d.cantidad, 0)
    end as delta
  from antes a
  full outer join despues d on d.producto_id = a.producto_id
  where case
    when p_modo = 'compra' then coalesce(d.cantidad, 0) - coalesce(a.cantidad, 0)
    else coalesce(a.cantidad, 0) - coalesce(d.cantidad, 0)
  end <> 0;
$$;

create or replace function sync_conceptos_factura(
  p_factura_id uuid,
  p_conceptos jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from conceptos_factura where factura_id = p_factura_id;

  insert into conceptos_factura (
    factura_id,
    descripcion,
    cantidad,
    precio_unitario,
    iva_tasa,
    descuento,
    subtotal,
    recargo_tasa,
    recargo_importe,
    producto_id,
    orden
  )
  select
    p_factura_id,
    coalesce(value->>'descripcion', ''),
    coalesce(nullif(value->>'cantidad', '')::numeric, 0),
    coalesce(nullif(value->>'precio_unitario', '')::numeric, 0),
    coalesce(nullif(value->>'iva_tasa', '')::numeric, 0),
    coalesce(nullif(value->>'descuento', '')::numeric, 0),
    coalesce(nullif(value->>'subtotal', '')::numeric, 0),
    coalesce(nullif(value->>'recargo_tasa', '')::numeric, 0),
    coalesce(nullif(value->>'recargo_importe', '')::numeric, 0),
    nullif(value->>'producto_id', '')::uuid,
    coalesce(nullif(value->>'orden', '')::int, ord - 1)
  from jsonb_array_elements(coalesce(p_conceptos, '[]'::jsonb)) with ordinality as l(value, ord);
end;
$$;

create or replace function sync_lineas_factura_proveedor(
  p_factura_id uuid,
  p_lineas jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from lineas_factura_proveedor where factura_id = p_factura_id;

  insert into lineas_factura_proveedor (
    factura_id,
    producto_id,
    descripcion,
    cantidad,
    precio_unitario,
    iva_tasa,
    descuento_porcentaje,
    subtotal,
    recargo_tasa,
    recargo_importe,
    orden
  )
  select
    p_factura_id,
    nullif(value->>'producto_id', '')::uuid,
    coalesce(value->>'descripcion', ''),
    coalesce(nullif(value->>'cantidad', '')::numeric, 0),
    coalesce(nullif(value->>'precio_unitario', '')::numeric, 0),
    coalesce(nullif(value->>'iva_tasa', '')::numeric, 0),
    coalesce(nullif(value->>'descuento_porcentaje', '')::numeric, 0),
    coalesce(nullif(value->>'subtotal', '')::numeric, 0),
    coalesce(nullif(value->>'recargo_tasa', '')::numeric, 0),
    coalesce(nullif(value->>'recargo_importe', '')::numeric, 0),
    coalesce(nullif(value->>'orden', '')::int, ord - 1)
  from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) with ordinality as l(value, ord);
end;
$$;

create or replace function sync_vencimientos_factura_proveedor(
  p_factura_id uuid,
  p_empresa_id uuid,
  p_vencimientos jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from vencimientos_factura_proveedor where factura_id = p_factura_id;

  insert into vencimientos_factura_proveedor (
    factura_id,
    empresa_id,
    fecha,
    importe,
    notas
  )
  select
    p_factura_id,
    p_empresa_id,
    nullif(value->>'fecha', '')::date,
    coalesce(nullif(value->>'importe', '')::numeric, 0),
    nullif(value->>'notas', '')
  from jsonb_array_elements(coalesce(p_vencimientos, '[]'::jsonb))
  where coalesce(value->>'fecha', '') <> ''
    and coalesce(nullif(value->>'importe', '')::numeric, 0) > 0;
end;
$$;

create or replace function sync_lineas_albaran_proveedor(
  p_albaran_id uuid,
  p_lineas jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from lineas_albaran_proveedor where albaran_id = p_albaran_id;

  insert into lineas_albaran_proveedor (
    albaran_id,
    descripcion,
    referencia,
    cantidad,
    precio_unitario,
    iva_tasa,
    subtotal,
    producto_id,
    orden
  )
  select
    p_albaran_id,
    coalesce(value->>'descripcion', ''),
    nullif(value->>'referencia', ''),
    coalesce(nullif(value->>'cantidad', '')::numeric, 0),
    coalesce(nullif(value->>'precio_unitario', '')::numeric, 0),
    coalesce(nullif(value->>'iva_tasa', '')::numeric, 0),
    coalesce(nullif(value->>'subtotal', '')::numeric, 0),
    nullif(value->>'producto_id', '')::uuid,
    coalesce(nullif(value->>'orden', '')::int, ord - 1)
  from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) with ordinality as l(value, ord);
end;
$$;

create or replace function sync_lineas_ticket(
  p_ticket_id uuid,
  p_lineas jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from lineas_ticket where ticket_id = p_ticket_id;

  insert into lineas_ticket (
    ticket_id,
    descripcion,
    cantidad,
    precio_unitario,
    iva_tasa,
    subtotal,
    recargo_tasa,
    recargo_importe,
    producto_id,
    orden
  )
  select
    p_ticket_id,
    coalesce(value->>'descripcion', ''),
    coalesce(nullif(value->>'cantidad', '')::numeric, 0),
    coalesce(nullif(value->>'precio_unitario', '')::numeric, 0),
    coalesce(nullif(value->>'iva_tasa', '')::numeric, 0),
    coalesce(nullif(value->>'subtotal', '')::numeric, 0),
    coalesce(nullif(value->>'recargo_tasa', '')::numeric, 0),
    coalesce(nullif(value->>'recargo_importe', '')::numeric, 0),
    nullif(value->>'producto_id', '')::uuid,
    coalesce(nullif(value->>'orden', '')::int, ord - 1)
  from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) with ordinality as l(value, ord);
end;
$$;

create or replace function actualizar_precios_productos_desde_lineas(
  p_lineas jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tiene_precio_manual boolean;
  v_tiene_mult_prod boolean;
  v_tiene_mult_prov boolean;
  v_linea jsonb;
  v_producto productos%rowtype;
  v_precio_base numeric;
  v_multiplicador numeric;
  v_precio_venta numeric;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'productos' and column_name = 'precio_venta_manual'
  ) into v_tiene_precio_manual;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'productos' and column_name = 'multiplicador_venta'
  ) into v_tiene_mult_prod;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proveedores' and column_name = 'multiplicador_venta'
  ) into v_tiene_mult_prov;

  for v_linea in
    select value
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
    where coalesce(value->>'producto_id', '') <> ''
  loop
    v_precio_base := coalesce(
      nullif(v_linea->>'precio_unitario_base', '')::numeric,
      nullif(v_linea->>'precio_unitario', '')::numeric,
      0
    );

    select *
      into v_producto
    from productos
    where id = nullif(v_linea->>'producto_id', '')::uuid
    for update;

    if not found then
      continue;
    end if;

    if v_tiene_mult_prod or v_tiene_mult_prov then
      v_multiplicador := 2.5;
      if v_tiene_mult_prod then
        execute 'select nullif(multiplicador_venta, 0) from productos where id = $1'
          into v_multiplicador
          using v_producto.id;
      end if;

      if (v_multiplicador is null or v_multiplicador <= 0) and v_tiene_mult_prov and v_producto.proveedor_id is not null then
        execute 'select nullif(multiplicador_venta, 0) from proveedores where id = $1'
          into v_multiplicador
          using v_producto.proveedor_id;
      end if;

      v_multiplicador := coalesce(nullif(v_multiplicador, 0), 2.5);
      v_precio_venta := round(v_precio_base * v_multiplicador, 2);
    end if;

    if v_tiene_precio_manual then
      execute '
        update productos
           set precio_compra = $2,
               precio_venta = case when coalesce(precio_venta_manual, false) then precio_venta else coalesce($3, precio_venta) end
         where id = $1
      ' using v_producto.id, v_precio_base, v_precio_venta;
    else
      update productos
         set precio_compra = v_precio_base,
             precio_venta = coalesce(v_precio_venta, precio_venta)
       where id = v_producto.id;
    end if;
  end loop;
end;
$$;

create or replace function revertir_movimientos_documento_atomico(
  p_empresa_id uuid,
  p_referencia_id uuid,
  p_referencia_tipos_origen text[],
  p_referencia_tipo_reversion text,
  p_notas text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov record;
  v_ref_linea text;
begin
  perform 1
  from productos p
  where p.empresa_id = p_empresa_id
    and p.id in (
      select distinct m.producto_id
      from movimientos_stock m
      where m.empresa_id = p_empresa_id
        and m.referencia_id = p_referencia_id
        and m.referencia_tipo = any(p_referencia_tipos_origen)
    )
  order by p.id
  for update;

  for v_mov in
    select m.id, m.producto_id, m.cantidad
    from movimientos_stock m
    where m.empresa_id = p_empresa_id
      and m.referencia_id = p_referencia_id
      and m.referencia_tipo = any(p_referencia_tipos_origen)
    order by m.producto_id, m.id
  loop
    v_ref_linea := 'reversion:' || v_mov.id::text;

    if exists (
      select 1
      from movimientos_stock r
      where r.empresa_id = p_empresa_id
        and r.referencia_tipo = p_referencia_tipo_reversion
        and r.referencia_id = p_referencia_id
        and coalesce(r.referencia_linea, '') = v_ref_linea
    ) then
      continue;
    end if;

    perform *
    from registrar_movimiento_stock(
      p_empresa_id,
      v_mov.producto_id,
      case when (-1 * v_mov.cantidad) >= 0 then 'ajuste_positivo' else 'ajuste_negativo' end,
      -1 * v_mov.cantidad,
      p_referencia_tipo_reversion,
      p_referencia_id,
      v_ref_linea,
      p_notas,
      false
    );
  end loop;
end;
$$;

create or replace function crear_factura_cliente_atomica(
  p_factura jsonb,
  p_conceptos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas%rowtype;
  v_factura_id uuid := coalesce(nullif(p_factura->>'id', '')::uuid, uuid_generate_v4());
  v_linea record;
begin
  insert into facturas (
    id, empresa_id, cliente_id, folio, fecha_emision, fecha_vencimiento,
    estado, subtotal, iva_total, recargo_total, total, notas
  ) values (
    v_factura_id,
    nullif(p_factura->>'empresa_id', '')::uuid,
    nullif(p_factura->>'cliente_id', '')::uuid,
    nullif(p_factura->>'folio', ''),
    coalesce(nullif(p_factura->>'fecha_emision', '')::date, current_date),
    nullif(p_factura->>'fecha_vencimiento', '')::date,
    coalesce(nullif(p_factura->>'estado', ''), 'borrador')::estado_factura,
    coalesce(nullif(p_factura->>'subtotal', '')::numeric, 0),
    coalesce(nullif(p_factura->>'iva_total', '')::numeric, 0),
    coalesce(nullif(p_factura->>'recargo_total', '')::numeric, 0),
    coalesce(nullif(p_factura->>'total', '')::numeric, 0),
    nullif(p_factura->>'notas', '')
  )
  on conflict (id) do nothing
  returning * into v_factura;

  if v_factura.id is null then
    select * into v_factura from facturas where id = v_factura_id;
    return to_jsonb(v_factura);
  end if;

  perform sync_conceptos_factura(v_factura.id, p_conceptos);

  if v_factura.estado in ('emitida', 'pagada', 'vencida') then
    perform lock_productos_documento(v_factura.empresa_id, p_conceptos);

    for v_linea in
      select value, ord
      from jsonb_array_elements(coalesce(p_conceptos, '[]'::jsonb)) with ordinality as l(value, ord)
      where coalesce(value->>'producto_id', '') <> ''
        and coalesce(nullif(value->>'cantidad', '')::numeric, 0) > 0
      order by ord
    loop
      perform *
      from registrar_movimiento_stock(
        v_factura.empresa_id,
        nullif(v_linea.value->>'producto_id', '')::uuid,
        'salida_factura',
        -1 * coalesce(nullif(v_linea.value->>'cantidad', '')::numeric, 0),
        'factura',
        v_factura.id,
        coalesce(v_linea.value->>'id', v_linea.value->>'_id', v_linea.value->>'_id_original', 'factura-linea-' || (v_linea.ord - 1)::text),
        'Salida por factura',
        false
      );
    end loop;
  end if;

  select * into v_factura from facturas where id = v_factura.id;
  return to_jsonb(v_factura);
end;
$$;

create or replace function actualizar_estado_factura_atomico(
  p_factura_id uuid,
  p_estado text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas%rowtype;
  v_linea record;
begin
  select * into v_factura
  from facturas
  where id = p_factura_id
  for update;

  if v_factura.id is null then
    raise exception 'Factura % no encontrada', p_factura_id;
  end if;

  if v_factura.estado not in ('emitida', 'pagada', 'vencida')
     and p_estado in ('emitida', 'pagada', 'vencida') then
    perform lock_productos_documento(
      v_factura.empresa_id,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'producto_id', c.producto_id, 'cantidad', c.cantidad) order by c.orden, c.id)
        from conceptos_factura c
        where c.factura_id = v_factura.id
      ), '[]'::jsonb)
    );

    for v_linea in
      select c.id, c.producto_id, c.cantidad
      from conceptos_factura c
      where c.factura_id = v_factura.id
        and c.producto_id is not null
        and c.cantidad > 0
      order by c.orden, c.id
    loop
      perform *
      from registrar_movimiento_stock(
        v_factura.empresa_id,
        v_linea.producto_id,
        'salida_factura',
        -1 * v_linea.cantidad,
        'factura',
        v_factura.id,
        v_linea.id::text,
        'Salida por cambio de estado de factura',
        false
      );
    end loop;
  end if;

  if v_factura.estado in ('emitida', 'pagada', 'vencida')
     and p_estado not in ('emitida', 'pagada', 'vencida') then
    perform revertir_movimientos_documento_atomico(
      v_factura.empresa_id,
      v_factura.id,
      array['factura', 'factura_edicion'],
      'factura_anulacion',
      'Reversión por anulación/cambio de estado de factura'
    );
  end if;

  update facturas
     set estado = p_estado::estado_factura
   where id = v_factura.id
   returning * into v_factura;

  return to_jsonb(v_factura);
end;
$$;

create or replace function eliminar_factura_atomica(
  p_factura_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas%rowtype;
begin
  select * into v_factura
  from facturas
  where id = p_factura_id
  for update;

  if v_factura.id is null then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  perform revertir_movimientos_documento_atomico(
    v_factura.empresa_id,
    v_factura.id,
    array['factura', 'factura_edicion'],
    'factura_borrado',
    'Reversión por borrado de factura'
  );

  delete from facturas where id = v_factura.id;
  return jsonb_build_object('deleted', true, 'id', v_factura.id);
end;
$$;

create or replace function actualizar_factura_cliente_atomica(
  p_factura_id uuid,
  p_cabecera jsonb,
  p_conceptos_nuevos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas%rowtype;
  v_lineas_antes jsonb;
  v_lineas_despues jsonb;
  v_delta record;
begin
  select * into v_factura
  from facturas
  where id = p_factura_id
  for update;

  if v_factura.id is null then
    raise exception 'Factura % no encontrada', p_factura_id;
  end if;

  v_lineas_antes := case
    when v_factura.estado in ('emitida', 'pagada', 'vencida') then
      coalesce((
        select jsonb_agg(jsonb_build_object('producto_id', c.producto_id, 'cantidad', c.cantidad))
        from conceptos_factura c
        where c.factura_id = v_factura.id
      ), '[]'::jsonb)
    else '[]'::jsonb
  end;

  update facturas
     set cliente_id = nullif(p_cabecera->>'cliente_id', '')::uuid,
         folio = coalesce(nullif(p_cabecera->>'folio', ''), v_factura.folio),
         fecha_emision = coalesce(nullif(p_cabecera->>'fecha_emision', '')::date, v_factura.fecha_emision),
         fecha_vencimiento = case when p_cabecera ? 'fecha_vencimiento' then nullif(p_cabecera->>'fecha_vencimiento', '')::date else v_factura.fecha_vencimiento end,
         estado = coalesce(nullif(p_cabecera->>'estado', ''), v_factura.estado::text)::estado_factura,
         subtotal = coalesce(nullif(p_cabecera->>'subtotal', '')::numeric, v_factura.subtotal),
         iva_total = coalesce(nullif(p_cabecera->>'iva_total', '')::numeric, v_factura.iva_total),
         recargo_total = coalesce(nullif(p_cabecera->>'recargo_total', '')::numeric, v_factura.recargo_total),
         total = coalesce(nullif(p_cabecera->>'total', '')::numeric, v_factura.total),
         notas = case when p_cabecera ? 'notas' then nullif(p_cabecera->>'notas', '') else v_factura.notas end
   where id = v_factura.id
   returning * into v_factura;

  perform sync_conceptos_factura(v_factura.id, p_conceptos_nuevos);

  v_lineas_despues := case
    when v_factura.estado in ('emitida', 'pagada', 'vencida') then p_conceptos_nuevos
    else '[]'::jsonb
  end;

  perform lock_productos_documento(v_factura.empresa_id, v_lineas_antes || v_lineas_despues);

  for v_delta in
    select *
    from calcular_deltas_stock_lineas(v_lineas_antes, v_lineas_despues, 'venta')
    order by producto_id
  loop
    perform *
    from registrar_movimiento_stock(
      v_factura.empresa_id,
      v_delta.producto_id,
      case when v_delta.delta >= 0 then 'ajuste_positivo' else 'salida_factura' end,
      v_delta.delta,
      'factura_edicion',
      v_factura.id,
      'factura-edit:' || v_delta.producto_id::text || ':' || v_delta.cantidad_antes::text || '->' || v_delta.cantidad_despues::text,
      'Ajuste por edición de factura',
      false
    );
  end loop;

  return to_jsonb(v_factura);
end;
$$;

create or replace function crear_factura_proveedor_atomica(
  p_factura jsonb,
  p_lineas jsonb default '[]'::jsonb,
  p_vencimientos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas_proveedor%rowtype;
  v_factura_id uuid := coalesce(nullif(p_factura->>'id', '')::uuid, uuid_generate_v4());
  v_linea record;
begin
  insert into facturas_proveedor (
    id, empresa_id, proveedor_id, numero, fecha_factura, fecha_vencimiento,
    estado, subtotal, iva_total, recargo_total, total, notas
  ) values (
    v_factura_id,
    nullif(p_factura->>'empresa_id', '')::uuid,
    nullif(p_factura->>'proveedor_id', '')::uuid,
    nullif(p_factura->>'numero', ''),
    coalesce(nullif(p_factura->>'fecha_factura', '')::date, current_date),
    nullif(p_factura->>'fecha_vencimiento', '')::date,
    coalesce(nullif(p_factura->>'estado', ''), 'pendiente'),
    coalesce(nullif(p_factura->>'subtotal', '')::numeric, 0),
    coalesce(nullif(p_factura->>'iva_total', '')::numeric, 0),
    coalesce(nullif(p_factura->>'recargo_total', '')::numeric, 0),
    coalesce(nullif(p_factura->>'total', '')::numeric, 0),
    nullif(p_factura->>'notas', '')
  )
  on conflict (id) do nothing
  returning * into v_factura;

  if v_factura.id is null then
    select * into v_factura from facturas_proveedor where id = v_factura_id;
    return to_jsonb(v_factura);
  end if;

  perform sync_lineas_factura_proveedor(v_factura.id, p_lineas);
  perform sync_vencimientos_factura_proveedor(v_factura.id, v_factura.empresa_id, p_vencimientos);
  perform actualizar_precios_productos_desde_lineas(p_lineas);

  if v_factura.estado in ('pendiente', 'pagada', 'vencida') then
    perform lock_productos_documento(v_factura.empresa_id, p_lineas);

    for v_linea in
      select value, ord
      from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) with ordinality as l(value, ord)
      where coalesce(value->>'producto_id', '') <> ''
        and coalesce(nullif(value->>'cantidad', '')::numeric, 0) > 0
      order by ord
    loop
      perform *
      from registrar_movimiento_stock(
        v_factura.empresa_id,
        nullif(v_linea.value->>'producto_id', '')::uuid,
        'entrada',
        coalesce(nullif(v_linea.value->>'cantidad', '')::numeric, 0),
        'factura_proveedor',
        v_factura.id,
        coalesce(v_linea.value->>'id', v_linea.value->>'_id', v_linea.value->>'_id_original', 'fp-linea-' || (v_linea.ord - 1)::text),
        'Entrada por factura proveedor',
        false
      );
    end loop;
  end if;

  return to_jsonb(v_factura);
end;
$$;

create or replace function actualizar_estado_factura_proveedor_atomico(
  p_factura_id uuid,
  p_estado text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas_proveedor%rowtype;
  v_tiene_albaranes boolean;
  v_linea record;
begin
  select * into v_factura
  from facturas_proveedor
  where id = p_factura_id
  for update;

  if v_factura.id is null then
    raise exception 'Factura proveedor % no encontrada', p_factura_id;
  end if;

  select exists(select 1 from albaranes_proveedor where factura_id = v_factura.id)
    into v_tiene_albaranes;

  if not v_tiene_albaranes
     and v_factura.estado not in ('pendiente', 'pagada', 'vencida')
     and p_estado in ('pendiente', 'pagada', 'vencida') then
    perform lock_productos_documento(
      v_factura.empresa_id,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', l.id, 'producto_id', l.producto_id, 'cantidad', l.cantidad) order by l.orden, l.id)
        from lineas_factura_proveedor l
        where l.factura_id = v_factura.id
      ), '[]'::jsonb)
    );

    for v_linea in
      select l.id, l.producto_id, l.cantidad
      from lineas_factura_proveedor l
      where l.factura_id = v_factura.id
        and l.producto_id is not null
        and l.cantidad > 0
      order by l.orden, l.id
    loop
      perform *
      from registrar_movimiento_stock(
        v_factura.empresa_id,
        v_linea.producto_id,
        'entrada',
        v_linea.cantidad,
        'factura_proveedor',
        v_factura.id,
        v_linea.id::text,
        'Entrada por cambio de estado de factura proveedor',
        false
      );
    end loop;
  end if;

  if not v_tiene_albaranes
     and v_factura.estado in ('pendiente', 'pagada', 'vencida')
     and p_estado not in ('pendiente', 'pagada', 'vencida') then
    perform revertir_movimientos_documento_atomico(
      v_factura.empresa_id,
      v_factura.id,
      array['factura_proveedor', 'factura_proveedor_edicion'],
      'factura_proveedor_cancel',
      'Reversión por anulación/cambio de estado de factura proveedor'
    );
  end if;

  update facturas_proveedor
     set estado = p_estado
   where id = v_factura.id
   returning * into v_factura;

  return to_jsonb(v_factura);
end;
$$;

create or replace function eliminar_factura_proveedor_atomica(
  p_factura_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas_proveedor%rowtype;
  v_tiene_albaranes boolean;
begin
  select * into v_factura
  from facturas_proveedor
  where id = p_factura_id
  for update;

  if v_factura.id is null then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  select exists(select 1 from albaranes_proveedor where factura_id = v_factura.id)
    into v_tiene_albaranes;

  if not v_tiene_albaranes then
    perform revertir_movimientos_documento_atomico(
      v_factura.empresa_id,
      v_factura.id,
      array['factura_proveedor', 'factura_proveedor_edicion'],
      'factura_proveedor_del',
      'Reversión por borrado de factura proveedor'
    );
  end if;

  delete from facturas_proveedor where id = v_factura.id;
  return jsonb_build_object('deleted', true, 'id', v_factura.id);
end;
$$;

create or replace function actualizar_factura_proveedor_atomica(
  p_factura_id uuid,
  p_cabecera jsonb,
  p_lineas_nuevas jsonb default '[]'::jsonb,
  p_vencimientos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas_proveedor%rowtype;
  v_tiene_albaranes boolean;
  v_lineas_antes jsonb;
  v_lineas_despues jsonb;
  v_delta record;
begin
  select * into v_factura
  from facturas_proveedor
  where id = p_factura_id
  for update;

  if v_factura.id is null then
    raise exception 'Factura proveedor % no encontrada', p_factura_id;
  end if;

  select exists(select 1 from albaranes_proveedor where factura_id = v_factura.id)
    into v_tiene_albaranes;

  v_lineas_antes := case
    when v_factura.estado in ('pendiente', 'pagada', 'vencida') and not v_tiene_albaranes then
      coalesce((
        select jsonb_agg(jsonb_build_object('producto_id', l.producto_id, 'cantidad', l.cantidad))
        from lineas_factura_proveedor l
        where l.factura_id = v_factura.id
      ), '[]'::jsonb)
    else '[]'::jsonb
  end;

  update facturas_proveedor
     set proveedor_id = nullif(p_cabecera->>'proveedor_id', '')::uuid,
         numero = case when p_cabecera ? 'numero' then nullif(p_cabecera->>'numero', '') else v_factura.numero end,
         fecha_factura = coalesce(nullif(p_cabecera->>'fecha_factura', '')::date, v_factura.fecha_factura),
         fecha_vencimiento = case when p_cabecera ? 'fecha_vencimiento' then nullif(p_cabecera->>'fecha_vencimiento', '')::date else v_factura.fecha_vencimiento end,
         estado = coalesce(nullif(p_cabecera->>'estado', ''), v_factura.estado),
         subtotal = coalesce(nullif(p_cabecera->>'subtotal', '')::numeric, v_factura.subtotal),
         iva_total = coalesce(nullif(p_cabecera->>'iva_total', '')::numeric, v_factura.iva_total),
         recargo_total = coalesce(nullif(p_cabecera->>'recargo_total', '')::numeric, v_factura.recargo_total),
         total = coalesce(nullif(p_cabecera->>'total', '')::numeric, v_factura.total),
         notas = case when p_cabecera ? 'notas' then nullif(p_cabecera->>'notas', '') else v_factura.notas end,
         actualizado_en = now()
   where id = v_factura.id
   returning * into v_factura;

  perform sync_lineas_factura_proveedor(v_factura.id, p_lineas_nuevas);
  perform sync_vencimientos_factura_proveedor(v_factura.id, v_factura.empresa_id, p_vencimientos);
  perform actualizar_precios_productos_desde_lineas(p_lineas_nuevas);

  v_lineas_despues := case
    when v_factura.estado in ('pendiente', 'pagada', 'vencida') and not v_tiene_albaranes then p_lineas_nuevas
    else '[]'::jsonb
  end;

  if not v_tiene_albaranes then
    perform lock_productos_documento(v_factura.empresa_id, v_lineas_antes || v_lineas_despues);

    for v_delta in
      select *
      from calcular_deltas_stock_lineas(v_lineas_antes, v_lineas_despues, 'compra')
      order by producto_id
    loop
      perform *
      from registrar_movimiento_stock(
        v_factura.empresa_id,
        v_delta.producto_id,
        case when v_delta.delta > 0 then 'entrada' else 'ajuste_negativo' end,
        v_delta.delta,
        'factura_proveedor_edicion',
        v_factura.id,
        'fp-edit:' || v_delta.producto_id::text || ':' || v_delta.cantidad_antes::text || '->' || v_delta.cantidad_despues::text,
        'Ajuste por edición de factura proveedor',
        false
      );
    end loop;
  end if;

  return to_jsonb(v_factura);
end;
$$;

create or replace function crear_albaran_proveedor_atomico(
  p_albaran jsonb,
  p_lineas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_albaran albaranes_proveedor%rowtype;
  v_albaran_id uuid := coalesce(nullif(p_albaran->>'id', '')::uuid, uuid_generate_v4());
  v_linea record;
begin
  insert into albaranes_proveedor (
    id, empresa_id, proveedor_id, numero, fecha_albaran,
    notas, estado, subtotal, iva_total, total, factura_id
  ) values (
    v_albaran_id,
    nullif(p_albaran->>'empresa_id', '')::uuid,
    nullif(p_albaran->>'proveedor_id', '')::uuid,
    nullif(p_albaran->>'numero', ''),
    coalesce(nullif(p_albaran->>'fecha_albaran', '')::date, current_date),
    nullif(p_albaran->>'notas', ''),
    coalesce(nullif(p_albaran->>'estado', ''), 'pendiente'),
    coalesce(nullif(p_albaran->>'subtotal', '')::numeric, 0),
    coalesce(nullif(p_albaran->>'iva_total', '')::numeric, 0),
    coalesce(nullif(p_albaran->>'total', '')::numeric, 0),
    nullif(p_albaran->>'factura_id', '')::uuid
  )
  on conflict (id) do nothing
  returning * into v_albaran;

  if v_albaran.id is null then
    select * into v_albaran from albaranes_proveedor where id = v_albaran_id;
    return to_jsonb(v_albaran);
  end if;

  perform sync_lineas_albaran_proveedor(v_albaran.id, p_lineas);
  perform lock_productos_documento(v_albaran.empresa_id, p_lineas);

  for v_linea in
    select value, ord
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) with ordinality as l(value, ord)
    where coalesce(value->>'producto_id', '') <> ''
      and coalesce(nullif(value->>'cantidad', '')::numeric, 0) > 0
    order by ord
  loop
    perform *
    from registrar_movimiento_stock(
      v_albaran.empresa_id,
      nullif(v_linea.value->>'producto_id', '')::uuid,
      'entrada',
      coalesce(nullif(v_linea.value->>'cantidad', '')::numeric, 0),
      'albaran_proveedor',
      v_albaran.id,
      coalesce(v_linea.value->>'id', v_linea.value->>'_id', v_linea.value->>'_id_original', 'alb-linea-' || (v_linea.ord - 1)::text),
      'Entrada por albarán proveedor',
      false
    );
  end loop;

  return to_jsonb(v_albaran);
end;
$$;

create or replace function actualizar_albaran_proveedor_atomico(
  p_albaran_id uuid,
  p_cabecera jsonb,
  p_lineas_nuevas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_albaran albaranes_proveedor%rowtype;
  v_lineas_antes jsonb;
  v_delta record;
begin
  select * into v_albaran
  from albaranes_proveedor
  where id = p_albaran_id
  for update;

  if v_albaran.id is null then
    raise exception 'Albarán % no encontrado', p_albaran_id;
  end if;

  v_lineas_antes := coalesce((
    select jsonb_agg(jsonb_build_object('producto_id', l.producto_id, 'cantidad', l.cantidad))
    from lineas_albaran_proveedor l
    where l.albaran_id = v_albaran.id
  ), '[]'::jsonb);

  update albaranes_proveedor
     set proveedor_id = nullif(p_cabecera->>'proveedor_id', '')::uuid,
         numero = case when p_cabecera ? 'numero' then nullif(p_cabecera->>'numero', '') else v_albaran.numero end,
         fecha_albaran = coalesce(nullif(p_cabecera->>'fecha_albaran', '')::date, v_albaran.fecha_albaran),
         notas = case when p_cabecera ? 'notas' then nullif(p_cabecera->>'notas', '') else v_albaran.notas end,
         estado = coalesce(nullif(p_cabecera->>'estado', ''), v_albaran.estado),
         subtotal = coalesce(nullif(p_cabecera->>'subtotal', '')::numeric, v_albaran.subtotal),
         iva_total = coalesce(nullif(p_cabecera->>'iva_total', '')::numeric, v_albaran.iva_total),
         total = coalesce(nullif(p_cabecera->>'total', '')::numeric, v_albaran.total)
   where id = v_albaran.id
   returning * into v_albaran;

  perform sync_lineas_albaran_proveedor(v_albaran.id, p_lineas_nuevas);
  perform lock_productos_documento(v_albaran.empresa_id, v_lineas_antes || p_lineas_nuevas);

  for v_delta in
    select *
    from calcular_deltas_stock_lineas(v_lineas_antes, p_lineas_nuevas, 'compra')
    order by producto_id
  loop
    perform *
    from registrar_movimiento_stock(
      v_albaran.empresa_id,
      v_delta.producto_id,
      case when v_delta.delta > 0 then 'entrada' else 'ajuste_negativo' end,
      v_delta.delta,
      'albaran_proveedor_edit',
      v_albaran.id,
      'alb-edit:' || v_delta.producto_id::text || ':' || v_delta.cantidad_antes::text || '->' || v_delta.cantidad_despues::text,
      'Ajuste por edición de albarán proveedor',
      false
    );
  end loop;

  return to_jsonb(v_albaran);
end;
$$;

create or replace function eliminar_albaran_proveedor_atomico(
  p_albaran_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_albaran albaranes_proveedor%rowtype;
begin
  select * into v_albaran
  from albaranes_proveedor
  where id = p_albaran_id
  for update;

  if v_albaran.id is null then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  perform revertir_movimientos_documento_atomico(
    v_albaran.empresa_id,
    v_albaran.id,
    array['albaran_proveedor', 'albaran_proveedor_edit'],
    'albaran_proveedor_del',
    'Reversión por borrado de albarán'
  );

  delete from albaranes_proveedor where id = v_albaran.id;
  return jsonb_build_object('deleted', true, 'id', v_albaran.id);
end;
$$;

create or replace function crear_factura_desde_albaranes_atomica(
  p_factura jsonb,
  p_lineas jsonb default '[]'::jsonb,
  p_albaran_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas_proveedor%rowtype;
  v_factura_id uuid := coalesce(nullif(p_factura->>'id', '')::uuid, uuid_generate_v4());
  v_conflictos int;
begin
  select count(*)
    into v_conflictos
  from albaranes_proveedor
  where id = any(coalesce(p_albaran_ids, '{}'))
    and factura_id is not null
    and factura_id <> v_factura_id;

  if v_conflictos > 0 then
    raise exception 'Alguno de los albaranes ya está asociado a otra factura.';
  end if;

  insert into facturas_proveedor (
    id, empresa_id, proveedor_id, numero, fecha_factura, fecha_vencimiento,
    estado, subtotal, iva_total, recargo_total, total, notas
  ) values (
    v_factura_id,
    nullif(p_factura->>'empresa_id', '')::uuid,
    nullif(p_factura->>'proveedor_id', '')::uuid,
    nullif(p_factura->>'numero', ''),
    coalesce(nullif(p_factura->>'fecha_factura', '')::date, current_date),
    nullif(p_factura->>'fecha_vencimiento', '')::date,
    coalesce(nullif(p_factura->>'estado', ''), 'pendiente'),
    coalesce(nullif(p_factura->>'subtotal', '')::numeric, 0),
    coalesce(nullif(p_factura->>'iva_total', '')::numeric, 0),
    coalesce(nullif(p_factura->>'recargo_total', '')::numeric, 0),
    coalesce(nullif(p_factura->>'total', '')::numeric, 0),
    nullif(p_factura->>'notas', '')
  )
  on conflict (id) do nothing
  returning * into v_factura;

  if v_factura.id is null then
    select * into v_factura from facturas_proveedor where id = v_factura_id;
    return to_jsonb(v_factura);
  end if;

  perform sync_lineas_factura_proveedor(v_factura.id, p_lineas);

  update albaranes_proveedor
     set estado = 'facturado',
         factura_id = v_factura.id
   where id = any(coalesce(p_albaran_ids, '{}'))
     and empresa_id = v_factura.empresa_id;

  return to_jsonb(v_factura);
end;
$$;

create or replace function aplicar_entrada_stock_factura_proveedor_atomica(
  p_factura_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura facturas_proveedor%rowtype;
  v_tiene_albaranes boolean;
  v_linea record;
begin
  select * into v_factura
  from facturas_proveedor
  where id = p_factura_id
  for update;

  if v_factura.id is null then
    raise exception 'Factura proveedor % no encontrada', p_factura_id;
  end if;

  select exists(select 1 from albaranes_proveedor where factura_id = v_factura.id)
    into v_tiene_albaranes;

  if v_tiene_albaranes then
    raise exception 'Esta factura agrupa albaranes ya contabilizados. No se puede aplicar entrada directa.';
  end if;

  perform lock_productos_documento(
    v_factura.empresa_id,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'producto_id', l.producto_id, 'cantidad', l.cantidad) order by l.orden, l.id)
      from lineas_factura_proveedor l
      where l.factura_id = v_factura.id
    ), '[]'::jsonb)
  );

  for v_linea in
    select l.id, l.producto_id, l.cantidad
    from lineas_factura_proveedor l
    where l.factura_id = v_factura.id
      and l.producto_id is not null
      and l.cantidad > 0
    order by l.orden, l.id
  loop
    perform *
    from registrar_movimiento_stock(
      v_factura.empresa_id,
      v_linea.producto_id,
      'entrada',
      v_linea.cantidad,
      'factura_proveedor',
      v_factura.id,
      v_linea.id::text,
      'Aplicación manual de entrada de stock de factura proveedor',
      false
    );
  end loop;

  return jsonb_build_object('aplicada', true, 'factura_id', v_factura.id);
end;
$$;

create or replace function crear_ticket_atomico(
  p_ticket jsonb,
  p_lineas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket tickets%rowtype;
  v_ticket_id uuid := coalesce(nullif(p_ticket->>'id', '')::uuid, uuid_generate_v4());
  v_linea record;
begin
  insert into tickets (
    id, empresa_id, numero, fecha, subtotal, iva_total, recargo_total,
    total, metodo_pago, efectivo_entregado, cambio, notas
  ) values (
    v_ticket_id,
    nullif(p_ticket->>'empresa_id', '')::uuid,
    coalesce(nullif(p_ticket->>'numero', '')::int, 1),
    coalesce(nullif(p_ticket->>'fecha', '')::timestamptz, now()),
    coalesce(nullif(p_ticket->>'subtotal', '')::numeric, 0),
    coalesce(nullif(p_ticket->>'iva_total', '')::numeric, 0),
    coalesce(nullif(p_ticket->>'recargo_total', '')::numeric, 0),
    coalesce(nullif(p_ticket->>'total', '')::numeric, 0),
    coalesce(nullif(p_ticket->>'metodo_pago', ''), 'efectivo'),
    nullif(p_ticket->>'efectivo_entregado', '')::numeric,
    nullif(p_ticket->>'cambio', '')::numeric,
    nullif(p_ticket->>'notas', '')
  )
  on conflict (id) do nothing
  returning * into v_ticket;

  if v_ticket.id is null then
    select * into v_ticket from tickets where id = v_ticket_id;
    return to_jsonb(v_ticket);
  end if;

  perform sync_lineas_ticket(v_ticket.id, p_lineas);
  perform lock_productos_documento(v_ticket.empresa_id, p_lineas);

  for v_linea in
    select value, ord
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) with ordinality as l(value, ord)
    where coalesce(value->>'producto_id', '') <> ''
      and coalesce(nullif(value->>'cantidad', '')::numeric, 0) > 0
    order by ord
  loop
    perform *
    from registrar_movimiento_stock(
      v_ticket.empresa_id,
      nullif(v_linea.value->>'producto_id', '')::uuid,
      'salida_ticket',
      -1 * coalesce(nullif(v_linea.value->>'cantidad', '')::numeric, 0),
      'ticket',
      v_ticket.id,
      coalesce(v_linea.value->>'id', v_linea.value->>'_id', v_linea.value->>'_id_original', 'ticket-linea-' || (v_linea.ord - 1)::text),
      'Salida por ticket',
      false
    );
  end loop;

  update empresas
     set siguiente_ticket = greatest(coalesce(siguiente_ticket, 1), v_ticket.numero + 1)
   where id = v_ticket.empresa_id;

  return to_jsonb(v_ticket);
end;
$$;

create or replace function eliminar_tickets_atomico(
  p_empresa_id uuid,
  p_ticket_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record;
  v_borrados int := 0;
begin
  for v_ticket in
    select t.id
    from tickets t
    where t.empresa_id = p_empresa_id
      and t.id = any(coalesce(p_ticket_ids, '{}'))
    order by t.id
    for update
  loop
    perform revertir_movimientos_documento_atomico(
      p_empresa_id,
      v_ticket.id,
      array['ticket', 'ticket_edicion'],
      'ticket_borrado',
      'Reversión por anulación/borrado de ticket'
    );

    delete from tickets where id = v_ticket.id;
    v_borrados := v_borrados + 1;
  end loop;

  return jsonb_build_object('deleted', v_borrados);
end;
$$;

grant execute on function crear_factura_cliente_atomica(jsonb, jsonb) to authenticated;
grant execute on function actualizar_estado_factura_atomico(uuid, text) to authenticated;
grant execute on function eliminar_factura_atomica(uuid) to authenticated;
grant execute on function actualizar_factura_cliente_atomica(uuid, jsonb, jsonb) to authenticated;
grant execute on function crear_factura_proveedor_atomica(jsonb, jsonb, jsonb) to authenticated;
grant execute on function actualizar_estado_factura_proveedor_atomico(uuid, text) to authenticated;
grant execute on function eliminar_factura_proveedor_atomica(uuid) to authenticated;
grant execute on function actualizar_factura_proveedor_atomica(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function crear_albaran_proveedor_atomico(jsonb, jsonb) to authenticated;
grant execute on function actualizar_albaran_proveedor_atomico(uuid, jsonb, jsonb) to authenticated;
grant execute on function eliminar_albaran_proveedor_atomico(uuid) to authenticated;
grant execute on function crear_factura_desde_albaranes_atomica(jsonb, jsonb, uuid[]) to authenticated;
grant execute on function aplicar_entrada_stock_factura_proveedor_atomica(uuid) to authenticated;
grant execute on function crear_ticket_atomico(jsonb, jsonb) to authenticated;
grant execute on function eliminar_tickets_atomico(uuid, uuid[]) to authenticated;
