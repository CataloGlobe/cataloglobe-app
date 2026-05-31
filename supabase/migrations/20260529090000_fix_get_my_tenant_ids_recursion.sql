-- =============================================================================
-- Permessi multi-sede — Fix: get_my_tenant_ids() recursive RLS + invited_email
--
-- Bug riprodotto (2026-05-29):
--   INSERT come authenticated impersonando owner su public.schedules → 42501
--   "new row violates row-level security policy".
--
-- Root cause isolata:
--   get_my_tenant_ids() branch B includeva `tm.invited_email = auth.email()`.
--   Quando il JWT non contiene 'email' (es. session token alcune Edge Function,
--   diagnostico Studio senza email), auth.email() ritorna NULL e l'eguaglianza
--   con tm.invited_email innescava un'evaluation instabile / recursive RLS
--   attraverso tenant_memberships (timeout su chiamata diretta della funzione).
--
-- Decisione (D1 audit, anticipata da Fase 3):
--   Branch invited_email RIMOSSO. Inviti pending sono già coperti da
--   get_my_pending_invites() RPC e dal flow /invite/:token. Vedere il tenant
--   via get_my_tenant_ids() PRIMA di accettare l'invito non ha semantica.
--
-- Side fix:
--   search_path TO '' (era 'public', anomalo). Allinea alle altre helper della
--   Fase 1+ che usano search_path vuoto + qualifiche public.* esplicite, come
--   da CLAUDE.md `## Pattern obbligatori — storage, SQL, Stripe`.
--
-- Side effect noto:
--   I 5 GRANT/REVOKE EXECUTE esistenti su public.get_my_tenant_ids() sono
--   preservati da CREATE OR REPLACE (signature invariata).
--
-- Vedi: 20260526170000_permissions_foundation.sql, docs/permissions-audit.md
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  -- Branch A: caller is the tenant owner
  SELECT t.id
  FROM public.tenants t
  WHERE t.owner_user_id = auth.uid()
    AND t.deleted_at IS NULL

  UNION

  -- Branch B: caller has an active membership in the tenant
  -- (membership by user_id only — invited_email branch removed
  --  to eliminate dependency on auth.email() which can be NULL
  --  in some JWT contexts and was causing recursive RLS evaluation)
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id   = auth.uid()
    AND tm.status    = 'active'
    AND t.deleted_at IS NULL
$$;

COMMENT ON FUNCTION public.get_my_tenant_ids() IS
  'Returns the set of tenant_ids the caller can access. '
  '2 branches: (1) caller is the tenant owner; '
  '(2) caller has an active membership (user_id only). '
  'Pending email invites are handled separately by '
  'get_my_pending_invites() RPC and the /invite/:token flow.';

COMMIT;
