-- =====================================================
-- SCHEMA · App de Facturación
-- Ejecuta esto en Supabase → SQL Editor → New Query
-- =====================================================

-- Habilitar UUID
create extension if not exists "uuid-ossp";

-- ─── EMPRESAS ───────────────────────────────────────
create table empresas (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  nombre        varchar(200) not null,
  nif_cif       varchar(30),
  direccion     text,
  ciudad        varchar(100),
  cp            varchar(10),
  pais          varchar(80) default 'España',
  email         varchar(255),
  telefono      varchar(30),
  logo_url      text,
  moneda        char(3) default 'EUR',
  siguiente_folio integer default 1,
  serie         varchar(10) default 'FAC',
  iva_default   decimal(5,2) default 21.00,
  creado_en     timestamptz default now()
);

-- ─── CLIENTES ───────────────────────────────────────
create table clientes (
  id            uuid primary key default uuid_generate_v4(),
  empresa_id    uuid references empresas(id) on delete cascade not null,
  nombre        varchar(200) not null,
  nif_cif       varchar(30),
  email         varchar(255),
  telefono      varchar(30),
  direccion     text,
  ciudad        varchar(100),
  cp            varchar(10),
  pais          varchar(80) default 'España',
  notas         text,
  creado_en     timestamptz default now()
);

-- ─── FACTURAS ───────────────────────────────────────
create type estado_factura as enum ('borrador','emitida','pagada','vencida','cancelada');

create table facturas (
  id              uuid primary key default uuid_generate_v4(),
  empresa_id      uuid references empresas(id) on delete cascade not null,
  cliente_id      uuid references clientes(id) on delete restrict not null,
  folio           varchar(30) not null,
  fecha_emision   date not null default current_date,
  fecha_vencimiento date,
  estado          estado_factura default 'borrador',
  subtotal        decimal(12,2) default 0,
  iva_total       decimal(12,2) default 0,
  total           decimal(12,2) default 0,
  notas           text,
  pdf_url         text,
  creado_en       timestamptz default now(),
  actualizado_en  timestamptz default now()
);

-- ─── CONCEPTOS DE FACTURA ───────────────────────────
create table conceptos_factura (
  id              uuid primary key default uuid_generate_v4(),
  factura_id      uuid references facturas(id) on delete cascade not null,
  descripcion     text not null,
  cantidad        decimal(10,3) default 1,
  precio_unitario decimal(12,2) not null,
  iva_tasa        decimal(5,2) default 21.00,
  descuento       decimal(5,2) default 0,
  subtotal        decimal(12,2) not null,
  orden           integer default 0
);

-- ─── PAGOS ──────────────────────────────────────────
create type metodo_pago as enum ('transferencia','tarjeta','efectivo','cheque','otro');

create table pagos (
  id              uuid primary key default uuid_generate_v4(),
  factura_id      uuid references facturas(id) on delete cascade not null,
  empresa_id      uuid references empresas(id) on delete cascade not null,
  fecha_pago      date not null default current_date,
  monto           decimal(12,2) not null,
  metodo          metodo_pago default 'transferencia',
  referencia      varchar(150),
  notas           text,
  creado_en       timestamptz default now()
);

-- =====================================================
-- ROW LEVEL SECURITY — cada usuario ve solo sus datos
-- =====================================================

alter table empresas        enable row level security;
alter table clientes        enable row level security;
alter table facturas        enable row level security;
alter table conceptos_factura enable row level security;
alter table pagos           enable row level security;

-- Políticas empresas
create policy "usuario ve sus empresas"
  on empresas for all using (auth.uid() = user_id);

-- Políticas clientes (via empresa)
create policy "usuario ve sus clientes"
  on clientes for all using (
    empresa_id in (select id from empresas where user_id = auth.uid())
  );

-- Políticas facturas
create policy "usuario ve sus facturas"
  on facturas for all using (
    empresa_id in (select id from empresas where user_id = auth.uid())
  );

-- Políticas conceptos
create policy "usuario ve sus conceptos"
  on conceptos_factura for all using (
    factura_id in (
      select f.id from facturas f
      join empresas e on e.id = f.empresa_id
      where e.user_id = auth.uid()
    )
  );

-- Políticas pagos
create policy "usuario ve sus pagos"
  on pagos for all using (
    empresa_id in (select id from empresas where user_id = auth.uid())
  );

-- =====================================================
-- FUNCIÓN: auto-actualizar updated_at en facturas
-- =====================================================
create or replace function update_actualizado_en()
returns trigger as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$ language plpgsql;

create trigger facturas_actualizado_en
  before update on facturas
  for each row execute function update_actualizado_en();
