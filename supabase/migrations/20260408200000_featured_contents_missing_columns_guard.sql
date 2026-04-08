-- =============================================================================
-- Guard: ensure featured_contents has all columns added by
-- 20260226105800_v2_featured_contents_update.sql.
--
-- That migration added pricing_mode, bundle_price, show_original_total,
-- internal_name, cta_text, cta_url, status, layout_style and renamed
-- cover_image_url → media_id.  If for any reason it was not applied
-- (e.g. staging DB restored from an earlier snapshot) those columns are
-- absent and every save silently ignores them, making them revert to the
-- column default on the next page load.
--
-- Each ADD COLUMN is idempotent (IF NOT EXISTS).  If the column already
-- exists the statement is a no-op; if it is missing it is added with the
-- same definition as the original migration.
-- =============================================================================

BEGIN;

DO $$
BEGIN

  -- internal_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'internal_name'
  ) THEN
    ALTER TABLE public.featured_contents
      ADD COLUMN internal_name text NOT NULL DEFAULT 'Nuovo contenuto';
    UPDATE public.featured_contents SET internal_name = title WHERE internal_name = 'Nuovo contenuto';
    ALTER TABLE public.featured_contents ALTER COLUMN internal_name DROP DEFAULT;
    RAISE NOTICE 'featured_contents: added internal_name';
  END IF;

  -- cta_text
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'cta_text'
  ) THEN
    ALTER TABLE public.featured_contents ADD COLUMN cta_text text NULL;
    RAISE NOTICE 'featured_contents: added cta_text';
  END IF;

  -- cta_url
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'cta_url'
  ) THEN
    ALTER TABLE public.featured_contents ADD COLUMN cta_url text NULL;
    RAISE NOTICE 'featured_contents: added cta_url';
  END IF;

  -- status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'status'
  ) THEN
    ALTER TABLE public.featured_contents
      ADD COLUMN status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published'));
    RAISE NOTICE 'featured_contents: added status';
  END IF;

  -- layout_style
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'layout_style'
  ) THEN
    ALTER TABLE public.featured_contents ADD COLUMN layout_style text NULL;
    RAISE NOTICE 'featured_contents: added layout_style';
  END IF;

  -- pricing_mode  ← the column that causes the reported bug when missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'pricing_mode'
  ) THEN
    ALTER TABLE public.featured_contents
      ADD COLUMN pricing_mode text NOT NULL DEFAULT 'none'
        CHECK (pricing_mode IN ('none', 'per_item', 'bundle'));
    RAISE NOTICE 'featured_contents: added pricing_mode';
  END IF;

  -- bundle_price
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'bundle_price'
  ) THEN
    ALTER TABLE public.featured_contents ADD COLUMN bundle_price numeric NULL;
    RAISE NOTICE 'featured_contents: added bundle_price';
  END IF;

  -- show_original_total
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'show_original_total'
  ) THEN
    ALTER TABLE public.featured_contents
      ADD COLUMN show_original_total boolean NOT NULL DEFAULT false;
    RAISE NOTICE 'featured_contents: added show_original_total';
  END IF;

  -- media_id (renamed from cover_image_url in the original migration)
  -- Only rename if cover_image_url still exists AND media_id does not.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'cover_image_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'media_id'
  ) THEN
    ALTER TABLE public.featured_contents RENAME COLUMN cover_image_url TO media_id;
    RAISE NOTICE 'featured_contents: renamed cover_image_url → media_id';
  END IF;

  -- Add media_id as a new nullable column if neither name exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'media_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'featured_contents'
      AND column_name  = 'cover_image_url'
  ) THEN
    ALTER TABLE public.featured_contents ADD COLUMN media_id text NULL;
    RAISE NOTICE 'featured_contents: added media_id';
  END IF;

END $$;

-- Force PostgREST to reload its schema cache so newly-added columns are
-- immediately visible to SELECT and writable via PATCH/PUT.
NOTIFY pgrst, 'reload schema';

COMMIT;
