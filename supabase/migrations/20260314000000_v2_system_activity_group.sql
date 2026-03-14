BEGIN;

-- =========================================================
-- Auto-create system activity group "Tutte le sedi" on
-- new tenant creation, and backfill existing tenants.
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_new_tenant_system_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.v2_activity_groups (tenant_id, name, is_system)
  VALUES (NEW.id, 'Tutte le sedi', TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_v2_tenant_created_system_group ON public.v2_tenants;
CREATE TRIGGER on_v2_tenant_created_system_group
AFTER INSERT ON public.v2_tenants
FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant_system_group();

-- Backfill existing tenants that are missing the system group
INSERT INTO public.v2_activity_groups (tenant_id, name, is_system)
SELECT t.id, 'Tutte le sedi', TRUE
FROM public.v2_tenants t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.v2_activity_groups ag
  WHERE ag.tenant_id = t.id
    AND ag.is_system = TRUE
    AND ag.name = 'Tutte le sedi'
);

COMMIT;
