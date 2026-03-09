-- =====================================================
-- FACTURAS DE PROVEEDOR (Compras)
-- Ejecuta en Supabase: SQL Editor > New Query > Run
-- =====================================================

create table if not exists facturas_proveedor (
  id               uuid primary key default uuid_generate_v4(),
  empresa_id       uuid references empresas(id) on delete cascade not null,
  proveedor_id     uuid references proveedores(id) on delete set null,
  numero           varchar(60),         -- nº de factura del proveedor
  fecha_factura    date not null default current_date,
  fecha_vencimiento date,
  estado           varchar(20) default 'pendiente',
  -- estados: 'pendiente', 'pagada', 'vencida', 'cancelada'
  subtotal         decimal(12,2) default 0,
  iva_total        decimal(12,2) default 0,
  total            decimal(12,2) default 0,
  notas            text,
  creado_en        timestamptz default now(),
  actualizado_en   timestamptz default now()
);

create table if not exists lineas_factura_proveedor (
  id               uuid primary key default uuid_generate_v4(),
  factura_id       uuid references facturas_proveedor(id) on delete cascade not null,
  producto_id      uuid references productos(id) on delete set null,
  descripcion      text not null,
  cantidad         decimal(10,3) default 1,
  precio_unitario  decimal(12,2) not null,
  iva_tasa         decimal(5,2) default 21,
  subtotal         decimal(12,2) not null,
  orden            integer default 0
);

-- RLS
alter table facturas_proveedor        enable row level security;
alter table lineas_factura_proveedor  enable row level security;

create policy "usuario ve sus facturas proveedor"
  on facturas_proveedor for all using (
    empresa_id in (select id from empresas where user_id = auth.uid())
  );

create policy "usuario ve sus lineas factura proveedor"
  on lineas_factura_proveedor for all using (
    factura_id in (
      select fp.id from facturas_proveedor fp
      join empresas e on e.id = fp.empresa_id
      where e.user_id = auth.uid()
    )
  );

-- Trigger updated_at
create trigger facturas_proveedor_actualizado_en
  before update on facturas_proveedor
  for each row execute function update_actualizado_en();

-- Añadir columna cliente_id (por si el emisor de la compra es un cliente)
alter table facturas_proveedor add column if not exists cliente_id uuid references clientes(id) on delete set null;
