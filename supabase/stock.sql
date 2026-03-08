-- =====================================================
-- MÓDULO DE STOCK - Proveedores, Productos, Movimientos
-- Ejecuta en Supabase: SQL Editor > New Query > Run
-- =====================================================

-- ─── PROVEEDORES ────────────────────────────────────
create table if not exists proveedores (
  id           uuid primary key default uuid_generate_v4(),
  empresa_id   uuid references empresas(id) on delete cascade not null,
  nombre       varchar(200) not null,
  nif_cif      varchar(30),
  email        varchar(255),
  telefono     varchar(30),
  direccion    text,
  ciudad       varchar(100),
  web          varchar(255),
  notas        text,
  activo       boolean default true,
  creado_en    timestamptz default now()
);

-- ─── PRODUCTOS ──────────────────────────────────────
create table if not exists productos (
  id             uuid primary key default uuid_generate_v4(),
  empresa_id     uuid references empresas(id) on delete cascade not null,
  proveedor_id   uuid references proveedores(id) on delete set null,
  nombre         varchar(200) not null,
  referencia     varchar(80),
  descripcion    text,
  precio_venta   decimal(12,2) default 0,
  precio_compra  decimal(12,2) default 0,
  iva_tasa       decimal(5,2) default 21,
  stock_actual   decimal(10,3) default 0,
  stock_minimo   decimal(10,3) default 0,
  unidad         varchar(20) default 'ud',
  categoria      varchar(80),
  activo         boolean default true,
  creado_en      timestamptz default now(),
  actualizado_en timestamptz default now()
);

-- ─── MOVIMIENTOS DE STOCK ───────────────────────────
create table if not exists movimientos_stock (
  id               uuid primary key default uuid_generate_v4(),
  empresa_id       uuid references empresas(id) on delete cascade not null,
  producto_id      uuid references productos(id) on delete cascade not null,
  tipo             varchar(30) not null,
  -- tipos: 'entrada', 'salida_factura', 'salida_ticket', 'ajuste_positivo', 'ajuste_negativo'
  cantidad         decimal(10,3) not null,
  stock_anterior   decimal(10,3),
  stock_posterior  decimal(10,3),
  referencia_id    uuid,
  referencia_tipo  varchar(20),
  -- 'factura' | 'ticket' | 'manual'
  notas            text,
  creado_en        timestamptz default now()
);

-- ─── COLUMNA producto_id EN LINEAS ──────────────────
alter table lineas_ticket      add column if not exists producto_id uuid references productos(id) on delete set null;
alter table conceptos_factura  add column if not exists producto_id uuid references productos(id) on delete set null;

-- ─── RLS ────────────────────────────────────────────
alter table proveedores       enable row level security;
alter table productos         enable row level security;
alter table movimientos_stock enable row level security;

create policy "usuario ve sus proveedores"
  on proveedores for all using (
    empresa_id in (select id from empresas where user_id = auth.uid())
  );

create policy "usuario ve sus productos"
  on productos for all using (
    empresa_id in (select id from empresas where user_id = auth.uid())
  );

create policy "usuario ve sus movimientos"
  on movimientos_stock for all using (
    empresa_id in (select id from empresas where user_id = auth.uid())
  );

-- ─── TRIGGER: actualizado_en en productos ───────────
create trigger productos_actualizado_en
  before update on productos
  for each row execute function update_actualizado_en();
