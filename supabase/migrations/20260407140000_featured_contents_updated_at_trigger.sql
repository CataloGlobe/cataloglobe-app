BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_featured_contents_updated_at ON public.featured_contents;
CREATE TRIGGER trg_featured_contents_updated_at
  BEFORE UPDATE ON public.featured_contents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
