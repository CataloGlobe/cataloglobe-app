-- Add a partial unique index to enforce at most one owner per tenant
CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_unique_owner_per_tenant
  ON public.tenant_memberships (tenant_id)
  WHERE role = 'owner';