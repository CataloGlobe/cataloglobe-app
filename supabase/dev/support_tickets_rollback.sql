-- =============================================================================
-- CataloGlobe V2 — Rollback: supporto (support_tickets + support_messages)
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`. Si esegue A MANO in Supabase Studio SQL editor (o
-- psql) e SOLO per annullare l'introduzione del supporto
-- (migration 20260827100000 → 20260827100005).
--
-- ATTENZIONE — DISTRUTTIVO. Il DROP TABLE porta via tutti i ticket e tutti i
-- messaggi. Non c'e' soft-delete: se le conversazioni servono ancora,
-- esportarle PRIMA di eseguire questo script.
--
-- Ordine delle operazioni. Prima di eseguire:
--   1. rimuovere il codice che legge/scrive support_tickets / support_messages
--      (service layer, pagina Aiuto, sezione /admin/supporto) e ri-deployare.
-- Invertire l'ordine lascia il frontend a interrogare tabelle inesistenti.
-- =============================================================================

-- Drop in ordine inverso rispetto all'applicazione.

-- 20260827100005 — trigger BEFORE INSERT. Il DROP TABLE li porterebbe via
-- comunque; qui espliciti per simmetria con la migration.
DROP TRIGGER IF EXISTS support_tickets_stamp_timestamps  ON public.support_tickets;
DROP TRIGGER IF EXISTS support_messages_stamp_created_at ON public.support_messages;

-- 20260827100004 (funzioni) + 20260827100005 (ACL).
DROP FUNCTION IF EXISTS public.support_stamp_ticket_timestamps();
DROP FUNCTION IF EXISTS public.support_stamp_message_timestamp();

-- 20260827100002 — trigger AFTER INSERT.
DROP TRIGGER IF EXISTS support_messages_touch_ticket ON public.support_messages;

-- 20260827100001 (funzione) + 20260827100002 / 20260827100005 (ACL).
-- Il DROP FUNCTION porta via anche i REVOKE/GRANT.
DROP FUNCTION IF EXISTS public.support_touch_ticket_on_message();

-- 20260827100000 — policy RLS.
-- Ridondante rispetto al DROP TABLE che segue, ma esplicito: se in futuro il
-- rollback dovesse fermarsi qui (tabelle conservate, feature disattivata),
-- questa e' la riga da tenere e le successive da commentare.
DROP POLICY IF EXISTS "Roles can read support_messages"              ON public.support_messages;
DROP POLICY IF EXISTS "Customers can insert support_messages"        ON public.support_messages;
DROP POLICY IF EXISTS "Platform admins can insert support_messages"  ON public.support_messages;
DROP POLICY IF EXISTS "No direct UPDATE on support_messages"         ON public.support_messages;
DROP POLICY IF EXISTS "No direct DELETE on support_messages"         ON public.support_messages;

DROP POLICY IF EXISTS "Roles can read support_tickets"               ON public.support_tickets;
DROP POLICY IF EXISTS "Roles can insert support_tickets"             ON public.support_tickets;
DROP POLICY IF EXISTS "Platform admins can update support_tickets"   ON public.support_tickets;
DROP POLICY IF EXISTS "No direct DELETE on support_tickets"          ON public.support_tickets;

-- 20260827100000 — tabelle. Figlio prima del padre (la FK ha ON DELETE
-- CASCADE, ma l'ordine esplicito evita di dipenderne).
DROP TABLE IF EXISTS public.support_messages;
DROP TABLE IF EXISTS public.support_tickets;

-- 20260827100000 — permessi.
-- role_permissions PRIMA di permissions: la FK ha ON DELETE CASCADE, quindi
-- il solo DELETE su permissions basterebbe, ma esplicito e' verificabile.
DELETE FROM public.role_permissions
WHERE permission_id IN ('support.read', 'support.write');

DELETE FROM public.permissions
WHERE id IN ('support.read', 'support.write');

-- =============================================================================
-- Verifica post-rollback — deve restituire 0 su ogni riga.
-- =============================================================================
-- SELECT
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema='public' AND table_name IN ('support_tickets','support_messages')) AS tabelle,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname LIKE 'support!_%' ESCAPE '!')                 AS funzioni,
--   (SELECT count(*) FROM public.permissions WHERE id LIKE 'support.%')                    AS permessi,
--   (SELECT count(*) FROM public.role_permissions WHERE permission_id LIKE 'support.%')    AS mapping;
