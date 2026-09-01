-- =====================================================
-- Arnés SQL para validar atomicidad de documentos y stock
-- Ejecutar SOLO en entorno de pruebas / staging.
-- Requiere haber aplicado:
--   schema.sql
--   stock.sql
--   recargo_equivalencia.sql
--   lineas_factura_proveedor_descuento.sql
--   stock_movimientos_idempotente.sql
--   documentos_stock_atomicos.sql
-- =====================================================

begin;

create or replace function assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end;
$$;

do $$
declare
  v_user_id uuid := (select id from auth.users order by created_at limit 1);
  v_empresa_id uuid := uuid_generate_v4();
  v_cliente_id uuid := uuid_generate_v4();
  v_proveedor_id uuid := uuid_generate_v4();
  v_producto_1 uuid := uuid_generate_v4();
  v_producto_2 uuid := uuid_generate_v4();
  v_producto_3 uuid := uuid_generate_v4();
  v_factura jsonb;
  v_factura_id uuid;
  v_ticket_id uuid;
  v_compra_id uuid;
  v_albaran_id uuid;
  v_stock_1 numeric;
  v_stock_2 numeric;
  v_lineas_count int;
begin
  perform assert_true(v_user_id is not null, 'Se necesita al menos un usuario en auth.users para ejecutar el arnés');

  insert into empresas (id, user_id, nombre, siguiente_folio, siguiente_ticket, serie)
  values (v_empresa_id, v_user_id, 'QA Atomicidad', 1, 1, 'FAC');

  insert into clientes (id, empresa_id, nombre)
  values (v_cliente_id, v_empresa_id, 'Cliente QA');

  insert into proveedores (id, empresa_id, nombre)
  values (v_proveedor_id, v_empresa_id, 'Proveedor QA');

  insert into productos (id, empresa_id, proveedor_id, nombre, referencia, stock_actual, precio_compra, precio_venta, iva_tasa)
  values
    (v_producto_1, v_empresa_id, v_proveedor_id, 'Producto 1', 'P1', 10, 5, 15, 21),
    (v_producto_2, v_empresa_id, v_proveedor_id, 'Producto 2', 'P2', 1, 5, 15, 21),
    (v_producto_3, v_empresa_id, v_proveedor_id, 'Producto 3', 'P3', 1, 5, 15, 21);

  -- 1) Rollback por fallo en segunda línea de factura cliente (stock insuficiente)
  begin
    perform crear_factura_cliente_atomica(
      jsonb_build_object(
        'id', uuid_generate_v4(),
        'empresa_id', v_empresa_id,
        'cliente_id', v_cliente_id,
        'folio', 'FAC-ROLLBACK-2',
        'fecha_emision', current_date,
        'estado', 'emitida',
        'subtotal', 30,
        'iva_total', 6.3,
        'recargo_total', 0,
        'total', 36.3
      ),
      jsonb_build_array(
        jsonb_build_object('descripcion', 'L1', 'producto_id', v_producto_1, 'cantidad', 1, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 10, 'orden', 0),
        jsonb_build_object('descripcion', 'L2', 'producto_id', v_producto_2, 'cantidad', 5, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 50, 'orden', 1)
      )
    );
    raise exception 'Debía fallar la factura por stock insuficiente en línea 2';
  exception when others then
    perform assert_true((select count(*) = 0 from facturas where folio = 'FAC-ROLLBACK-2'), 'La cabecera no hizo rollback en línea 2');
    perform assert_true((select stock_actual = 10 from productos where id = v_producto_1), 'El stock del producto 1 cambió pese al rollback en línea 2');
    perform assert_true((select stock_actual = 1 from productos where id = v_producto_2), 'El stock del producto 2 cambió pese al rollback en línea 2');
  end;

  -- 2) Rollback por fallo en tercera línea de ticket
  begin
    perform crear_ticket_atomico(
      jsonb_build_object(
        'id', uuid_generate_v4(),
        'empresa_id', v_empresa_id,
        'numero', 1,
        'subtotal', 30,
        'iva_total', 6.3,
        'recargo_total', 0,
        'total', 36.3,
        'metodo_pago', 'efectivo'
      ),
      jsonb_build_array(
        jsonb_build_object('descripcion', 'L1', 'producto_id', v_producto_1, 'cantidad', 1, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 10, 'orden', 0),
        jsonb_build_object('descripcion', 'L2', 'producto_id', v_producto_2, 'cantidad', 1, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 10, 'orden', 1),
        jsonb_build_object('descripcion', 'L3', 'producto_id', v_producto_3, 'cantidad', 5, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 50, 'orden', 2)
      )
    );
    raise exception 'Debía fallar el ticket por stock insuficiente en línea 3';
  exception when others then
    perform assert_true((select count(*) = 0 from tickets where numero = 1 and empresa_id = v_empresa_id), 'El ticket no hizo rollback en línea 3');
    perform assert_true((select stock_actual = 10 from productos where id = v_producto_1), 'Producto 1 alterado por ticket fallido');
    perform assert_true((select stock_actual = 1 from productos where id = v_producto_2), 'Producto 2 alterado por ticket fallido');
    perform assert_true((select stock_actual = 1 from productos where id = v_producto_3), 'Producto 3 alterado por ticket fallido');
  end;

  -- Crear factura emitida válida para pruebas de edición/anulación
  v_factura := crear_factura_cliente_atomica(
    jsonb_build_object(
      'id', uuid_generate_v4(),
      'empresa_id', v_empresa_id,
      'cliente_id', v_cliente_id,
      'folio', 'FAC-OK-1',
      'fecha_emision', current_date,
      'estado', 'emitida',
      'subtotal', 10,
      'iva_total', 2.1,
      'recargo_total', 0,
      'total', 12.1
    ),
    jsonb_build_array(
      jsonb_build_object('descripcion', 'L1', 'producto_id', v_producto_1, 'cantidad', 1, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 10, 'orden', 0)
    )
  );
  v_factura_id := (v_factura->>'id')::uuid;

  -- 3) Fallo de actualización de cabecera: cliente inexistente -> rollback completo
  select stock_actual into v_stock_1 from productos where id = v_producto_1;
  select count(*) into v_lineas_count from conceptos_factura where factura_id = v_factura_id;
  begin
    perform actualizar_factura_cliente_atomica(
      v_factura_id,
      jsonb_build_object(
        'cliente_id', uuid_generate_v4(),
        'folio', 'FAC-OK-1',
        'fecha_emision', current_date,
        'estado', 'emitida',
        'subtotal', 20,
        'iva_total', 4.2,
        'recargo_total', 0,
        'total', 24.2
      ),
      jsonb_build_array(
        jsonb_build_object('descripcion', 'L1 edit', 'producto_id', v_producto_1, 'cantidad', 2, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 20, 'orden', 0)
      )
    );
    raise exception 'Debía fallar la actualización de cabecera';
  exception when others then
    perform assert_true((select count(*) = v_lineas_count from conceptos_factura where factura_id = v_factura_id), 'Las líneas cambiaron pese al fallo de cabecera');
    perform assert_true((select stock_actual = v_stock_1 from productos where id = v_producto_1), 'El stock cambió pese al fallo de cabecera');
  end;

  -- 4) Fallo de inserción de líneas en factura proveedor -> rollback de delete+insert
  v_compra_id := uuid_generate_v4();
  perform crear_factura_proveedor_atomica(
    jsonb_build_object(
      'id', v_compra_id,
      'empresa_id', v_empresa_id,
      'proveedor_id', v_proveedor_id,
      'numero', 'FP-OK-1',
      'fecha_factura', current_date,
      'estado', 'pendiente',
      'subtotal', 10,
      'iva_total', 2.1,
      'recargo_total', 0,
      'total', 12.1
    ),
    jsonb_build_array(
      jsonb_build_object('descripcion', 'Compra base', 'producto_id', v_producto_2, 'cantidad', 1, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 10, 'orden', 0)
    ),
    '[]'::jsonb
  );

  select count(*) into v_lineas_count from lineas_factura_proveedor where factura_id = v_compra_id;
  select stock_actual into v_stock_2 from productos where id = v_producto_2;

  begin
    perform actualizar_factura_proveedor_atomica(
      v_compra_id,
      jsonb_build_object(
        'proveedor_id', v_proveedor_id,
        'numero', 'FP-OK-1',
        'fecha_factura', current_date,
        'estado', 'pendiente',
        'subtotal', 10,
        'iva_total', 2.1,
        'recargo_total', 0,
        'total', 12.1
      ),
      jsonb_build_array(
        jsonb_build_object('descripcion', null, 'producto_id', v_producto_2, 'cantidad', 2, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 20, 'orden', 0)
      ),
      '[]'::jsonb
    );
    raise exception 'Debía fallar la inserción de líneas de factura proveedor';
  exception when others then
    perform assert_true((select count(*) = v_lineas_count from lineas_factura_proveedor where factura_id = v_compra_id), 'Las líneas originales no se restauraron');
    perform assert_true((select stock_actual = v_stock_2 from productos where id = v_producto_2), 'El stock cambió pese al fallo de reinserción');
  end;

  -- 5) Fallo de reversa: consumir stock y luego intentar borrar compra
  v_albaran_id := uuid_generate_v4();
  perform crear_albaran_proveedor_atomico(
    jsonb_build_object(
      'id', v_albaran_id,
      'empresa_id', v_empresa_id,
      'proveedor_id', v_proveedor_id,
      'numero', 'ALB-OK-1',
      'fecha_albaran', current_date,
      'estado', 'pendiente',
      'subtotal', 10,
      'iva_total', 2.1,
      'total', 12.1
    ),
    jsonb_build_array(
      jsonb_build_object('descripcion', 'Alta stock', 'producto_id', v_producto_3, 'cantidad', 1, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 10, 'orden', 0)
    )
  );

  perform crear_factura_cliente_atomica(
    jsonb_build_object(
      'id', uuid_generate_v4(),
      'empresa_id', v_empresa_id,
      'cliente_id', v_cliente_id,
      'folio', 'FAC-CONSUME-P3',
      'fecha_emision', current_date,
      'estado', 'emitida',
      'subtotal', 10,
      'iva_total', 2.1,
      'recargo_total', 0,
      'total', 12.1
    ),
    jsonb_build_array(
      jsonb_build_object('descripcion', 'Consume P3', 'producto_id', v_producto_3, 'cantidad', 2, 'precio_unitario', 10, 'iva_tasa', 21, 'subtotal', 20, 'orden', 0)
    )
  );

  begin
    perform eliminar_albaran_proveedor_atomico(v_albaran_id);
    raise exception 'Debía fallar la reversa del albarán por stock insuficiente';
  exception when others then
    perform assert_true((select count(*) = 1 from albaranes_proveedor where id = v_albaran_id), 'El albarán desapareció pese al fallo de reversa');
  end;

  -- 6) Doble reversa segura: cancelar dos veces la misma factura
  perform actualizar_estado_factura_atomico(v_factura_id, 'cancelada');
  select stock_actual into v_stock_1 from productos where id = v_producto_1;
  perform actualizar_estado_factura_atomico(v_factura_id, 'cancelada');
  perform assert_true((select stock_actual = v_stock_1 from productos where id = v_producto_1), 'La doble reversa alteró stock');
end;
$$;

rollback;
