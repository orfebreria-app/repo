-- Columna imagen en productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen_url text;

-- Bucket para imágenes de productos
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acceso (ignorar si ya existen)
DO $$
BEGIN
  BEGIN
    CREATE POLICY "public_read_productos" ON storage.objects
      FOR SELECT USING (bucket_id = 'productos');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE POLICY "auth_upload_productos" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'productos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE POLICY "auth_delete_productos" ON storage.objects
      FOR DELETE USING (bucket_id = 'productos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
