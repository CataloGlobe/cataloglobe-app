-- Irrobustimento di list_active_public_slugs() (Gap #1).
-- Solo CREATE OR REPLACE: il REVOKE/GRANT del file 20260719120001 resta valido
-- (REPLACE preserva i privilegi esistenti). NON ripetere revoke/grant qui.
--
-- Modifiche:
--   - `stable`: volatility corretta per una funzione read-only (miglior planning,
--     nessun side-effect). Prima era volatile-implicito.
--   - cast esplicito `::text` su slug e base_language_code: difesa contro un
--     eventuale mismatch della RETURNS TABLE se in futuro le colonne diventassero
--     un domain/varchar. Oggi sono già `text` (no-op), ma rende la funzione
--     robusta al cambio di tipo sottostante.
--
-- ⚠️ L'allowlist subscription DEVE restare allineata a VALID_SUBSCRIPTION_STATUSES
--    in supabase/functions/_shared/checkOrderingState.ts ('active','trialing','past_due').

create or replace function public.list_active_public_slugs()
returns table (slug text, tenant_id uuid, base_lang text)
language sql
stable
security definer
set search_path = ''
as $$
    select a.slug::text, a.tenant_id, t.base_language_code::text
    from public.activities a
    join public.tenants t on t.id = a.tenant_id
    where a.status = 'active'
      and t.subscription_status in ('active', 'trialing', 'past_due')
      and t.deleted_at is null;
$$;
