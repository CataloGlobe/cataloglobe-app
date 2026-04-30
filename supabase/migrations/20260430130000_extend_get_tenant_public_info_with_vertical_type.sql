-- Extend get_tenant_public_info with vertical_type.
--
-- Consolidates the public tenant lookup so resolve-public-catalog can read
-- vertical_type via the existing SECURITY DEFINER RPC instead of issuing a
-- parallel direct SELECT on the `tenants` table.
--
-- All other characteristics are preserved (RETURNS jsonb, LANGUAGE plpgsql,
-- SECURITY DEFINER, SET search_path = 'public', deleted_at IS NULL filter).
-- CREATE OR REPLACE keeps existing GRANTs (anon, authenticated) intact.

CREATE OR REPLACE FUNCTION public.get_tenant_public_info(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'logo_url', t.logo_url,
      'name', t.name,
      'subscription_status', t.subscription_status,
      'vertical_type', t.vertical_type
    )
    FROM public.tenants t
    WHERE t.id = p_tenant_id AND t.deleted_at IS NULL
  );
END;
$$;
