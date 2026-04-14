CREATE TABLE IF NOT EXISTS catalogos_proveedor (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid references empresas(id) on delete cascade not null,
  proveedor_id uuid references proveedores(id) on delete cascade not null,
  nombre       varchar(200) not null,
  archivo_url  text not null,
  tamano       varchar(50),
  creado_en    timestamptz default now()
);

alter table catalogos_proveedor enable row level security;
create policy "empresa_owner_catalogos" on catalogos_proveedor
  using (empresa_id = (select id from empresas where user_id = auth.uid()));

-- Bucket para catálogos PDF
INSERT INTO storage.buckets (id, name, public) VALUES ('catalogos', 'catalogos', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "catalogos_select" ON storage.objects FOR SELECT USING (bucket_id = 'catalogos');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "catalogos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'catalogos');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "catalogos_delete" ON storage.objects FOR DELETE USING (bucket_id = 'catalogos');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
