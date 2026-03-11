-- Tabla de plazos de pago para facturas de proveedor
CREATE TABLE IF NOT EXISTS vencimientos_factura_proveedor (
  id            uuid primary key default gen_random_uuid(),
  factura_id    uuid references facturas_proveedor(id) on delete cascade not null,
  empresa_id    uuid references empresas(id) on delete cascade not null,
  fecha         date not null,
  importe       decimal(12,2) not null default 0,
  pagado        boolean default false,
  notas         varchar(200),
  created_at    timestamptz default now()
);

alter table vencimientos_factura_proveedor enable row level security;
create policy "empresa_owner" on vencimientos_factura_proveedor
  using (empresa_id = (select id from empresas where user_id = auth.uid()));
