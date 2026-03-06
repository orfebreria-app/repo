-- =====================================================
-- PRESUPUESTOS - nueva tabla
-- Ejecuta en Supabase: SQL Editor > New Query > Run
-- =====================================================

create type estado_presupuesto as enum ('borrador','enviado','aceptado','rechazado','caducado');

create table presupuestos (
  id                uuid primary key default uuid_generate_v4(),
  empresa_id        uuid references empresas(id) on delete cascade not null,
  cliente_id        uuid references clientes(id) on delete restrict not null,
  numero            varchar(30) not null,
  fecha_emision     date not null default current_date,
  fecha_validez     date,
  estado            estado_presupuesto default 'borrador',
  subtotal          decimal(12,2) default 0,
  iva_total         decimal(12,2) default 0,
  total             decimal(12,2) default 0,
  notas             text,
  condiciones       text,
  creado_en         timestamptz default now(),
  actualizado_en    timestamptz default now()
);

create table conceptos_presupuesto (
  id              uuid primary key default uuid_generate_v4(),
  presupuesto_id  uuid references presupuestos(id) on delete cascade not null,
  descripcion     text not null,
  cantidad        decimal(10,3) default 1,
  precio_unitario decimal(12,2) not null,
  iva_tasa        decimal(5,2) default 21.00,
  descuento       decimal(5,2) default 0,
  subtotal        decimal(12,2) not null,
  orden           integer default 0
);

-- Columna para siguiente numero de presupuesto
alter table empresas add column if not exists siguiente_presupuesto integer default 1;
alter table empresas add column if not exists serie_presupuesto varchar(10) default 'PRE';

-- Columna para plantilla de presupuesto personalizada
alter table empresas add column if not exists presupuesto_config jsonb default '{}'::jsonb;

-- RLS
alter table presupuestos          enable row level security;
alter table conceptos_presupuesto enable row level security;

create policy "usuario ve sus presupuestos"
  on presupuestos for all
  using (empresa_id in (select id from empresas where user_id = auth.uid()));

create policy "usuario ve sus conceptos presupuesto"
  on conceptos_presupuesto for all
  using (
    presupuesto_id in (
      select p.id from presupuestos p
      join empresas e on e.id = p.empresa_id
      where e.user_id = auth.uid()
    )
  );

-- Trigger actualizado_en
create or replace function update_presupuesto_actualizado_en()
returns trigger as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$ language plpgsql;

create trigger presupuestos_actualizado_en
  before update on presupuestos
  for each row execute function update_presupuesto_actualizado_en();
