-- =====================================================
-- TICKETS DE VENTA - nueva tabla
-- Ejecuta en Supabase: SQL Editor > New Query > Run
-- =====================================================

create table tickets (
  id                uuid primary key default uuid_generate_v4(),
  empresa_id        uuid references empresas(id) on delete cascade not null,
  numero            integer not null,
  fecha             timestamptz default now(),
  subtotal          decimal(12,2) default 0,
  iva_total         decimal(12,2) default 0,
  total             decimal(12,2) default 0,
  metodo_pago       varchar(30) default 'efectivo',
  efectivo_entregado decimal(12,2),
  cambio            decimal(12,2),
  notas             text,
  creado_en         timestamptz default now()
);

create table lineas_ticket (
  id              uuid primary key default uuid_generate_v4(),
  ticket_id       uuid references tickets(id) on delete cascade not null,
  descripcion     text not null,
  cantidad        decimal(10,3) default 1,
  precio_unitario decimal(12,2) not null,
  iva_tasa        decimal(5,2) default 21,
  subtotal        decimal(12,2) not null,
  orden           integer default 0
);

-- Columna para el siguiente numero de ticket en empresas
alter table empresas add column if not exists siguiente_ticket integer default 1;

-- RLS
alter table tickets       enable row level security;
alter table lineas_ticket enable row level security;

create policy "usuario ve sus tickets"
  on tickets for all
  using (
    empresa_id in (select id from empresas where user_id = auth.uid())
  );

create policy "usuario ve sus lineas ticket"
  on lineas_ticket for all
  using (
    ticket_id in (
      select t.id from tickets t
      join empresas e on e.id = t.empresa_id
      where e.user_id = auth.uid()
    )
  );
