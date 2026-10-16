-- Supabase development project ONLY. Do not run on plain local PostgreSQL.
-- Supabase owns storage tables; Prisma never migrates them.
BEGIN;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-room-private', 'review-room-private', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'review-room-private' AND name = 'review-room-private'
      AND public = false AND file_size_limit = 10485760
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ) THEN
    RAISE EXCEPTION 'Existing bucket configuration differs. Inspect it before continuing.';
  END IF;
END $$;
COMMIT;
-- Intentionally no anon/authenticated storage.objects access policies.
-- In Step 4 authorized server code issues narrowly scoped signed capabilities.
-- Bucket MIME limits are early filtering, not authoritative byte validation.
