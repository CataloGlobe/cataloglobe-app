BEGIN;

-- =========================================
-- V2: TENANT MEMBERSHIPS
-- =========================================
CREATE TABLE IF NOT EXISTS public.v2_tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL,
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- Unique membership per tenant/user
CREATE UNIQUE INDEX IF NOT EXISTS v2_tenant_memberships_tenant_id_user_id_key
  ON public.v2_tenant_memberships (tenant_id, user_id);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS v2_tenant_memberships_tenant_id_idx
  ON public.v2_tenant_memberships (tenant_id);

CREATE INDEX IF NOT EXISTS v2_tenant_memberships_user_id_idx
  ON public.v2_tenant_memberships (user_id);

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS v2_tenant_memberships_set_updated_at ON public.v2_tenant_memberships;
CREATE TRIGGER v2_tenant_memberships_set_updated_at
BEFORE UPDATE ON public.v2_tenant_memberships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.v2_tenant_memberships ENABLE ROW LEVEL SECURITY;

-- Policy 1: tenant owner can manage memberships
DROP POLICY IF EXISTS "Tenant owner can manage memberships" ON public.v2_tenant_memberships;
CREATE POLICY "Tenant owner can manage memberships"
ON public.v2_tenant_memberships
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.v2_tenants t
    WHERE t.id = v2_tenant_memberships.tenant_id
      AND t.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.v2_tenants t
    WHERE t.id = v2_tenant_memberships.tenant_id
      AND t.owner_user_id = auth.uid()
  )
);

-- Policy 2: active members can read memberships of their tenant
DROP POLICY IF EXISTS "Active members can read memberships" ON public.v2_tenant_memberships;
CREATE POLICY "Active members can read memberships"
ON public.v2_tenant_memberships
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = v2_tenant_memberships.tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

-- Bootstrap owner membership on tenant creation
CREATE OR REPLACE FUNCTION public.handle_new_tenant_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.v2_tenant_memberships (
    tenant_id,
    user_id,
    role,
    status
  ) VALUES (
    NEW.id,
    NEW.owner_user_id,
    'owner',
    'active'
  )
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_v2_tenant_created ON public.v2_tenants;
CREATE TRIGGER on_v2_tenant_created
AFTER INSERT ON public.v2_tenants
FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant_membership();

COMMIT;
