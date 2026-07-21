create table if not exists albaranes_proveedor (
  id           uuid primary key default uuid_generate_v4(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id),
  numero       varchar(50),
  fecha_albaran date not null default current_date,
  notas        text,
  estado       varchar(20) not null default 'pendiente',
  factura_id   uuid references facturas_proveedor(id) on delete set null,
  subtotal     numeric(10,2) default 0,
  iva_total    numeric(10,2) default 0,
  total        numeric(10,2) default 0,
  creado_en    timestamptz default now()
);

create table if not exists lineas_albaran_proveedor (
  id              uuid primary key default uuid_generate_v4(),
  albaran_id      uuid not null references albaranes_proveedor(id) on delete cascade,
  descripcion     text not null,
  referencia      varchar(60),
  cantidad        numeric(10,3) not null default 1,
  precio_unitario numeric(10,2) not null default 0,
  iva_tasa        numeric(5,2) not null default 21,
  subtotal        numeric(10,2) not null default 0,
  producto_id     uuid references productos(id),
  orden           int default 0
);

alter table albaranes_proveedor enable row level security;
alter table lineas_albaran_proveedor enable row level security;

drop policy if exists "albaranes_proveedor_own" on albaranes_proveedor;
create policy "albaranes_proveedor_own" on albaranes_proveedor for all
  using (empresa_id in (select id from empresas where user_id = auth.uid()));

drop policy if exists "lineas_albaran_proveedor_own" on lineas_albaran_proveedor;
create policy "lineas_albaran_proveedor_own" on lineas_albaran_proveedor for all
  using (albaran_id in (
    select id from albaranes_proveedor
    where empresa_id in (select id from empresas where user_id = auth.uid())
  ));

create index if not exists idx_albaranes_proveedor_empresa on albaranes_proveedor(empresa_id, estado);
create index if not exists idx_lineas_albaran_albaran on lineas_albaran_proveedor(albaran_id);
