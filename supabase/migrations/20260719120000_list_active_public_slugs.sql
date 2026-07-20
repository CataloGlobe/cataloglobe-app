-- RPC per il pre-warming degli snapshot Redis (Gap #1).
-- Ritorna l'elenco degli slug pubblici "attivi" da tenere caldi in cache.
--
-- ⚠️ L'allowlist subscription qui DEVE restare allineata a
--    VALID_SUBSCRIPTION_STATUSES in supabase/functions/_shared/checkOrderingState.ts
--    ('active','trialing','past_due'). Se cambia là, aggiorna qui.
--
-- Criterio (identico al gate runtime del resolver public-catalog):
--   - activities.status = 'active'            (sede pubblicata)
--   - tenants.subscription_status IN (...)    (subscription attiva / trial / grace)
--   - tenants.deleted_at IS NULL              (tenant non soft-deleted)
-- Il runtime NON valuta trial_until (solo la state machine subscription_status),
-- quindi NON filtriamo su trial_until.
--
-- SECURITY DEFINER perché chiamata dal cron server-side (service_role) e legge
-- tenants/activities scavalcando la RLS. GRANT ristretto a service_role nel file
-- di migration successivo (20260719120001) — split per evitare SQLSTATE 42601 su
-- CREATE FUNCTION + REVOKE/GRANT nello stesso file (db push).

create or replace function public.list_active_public_slugs()
returns table (slug text, tenant_id uuid, base_lang text)
language sql
security definer
set search_path = ''
as $$
    select a.slug, a.tenant_id, t.base_language_code
    from public.activities a
    join public.tenants t on t.id = a.tenant_id
    where a.status = 'active'
      and t.subscription_status in ('active', 'trialing', 'past_due')
      and t.deleted_at is null;
$$;
