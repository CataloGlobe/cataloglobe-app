-- =============================================================================
-- CataloGlobe V2 — Rollback: supporto (support_tickets + support_messages)
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`. Si esegue A MANO in Supabase Studio SQL editor (o
-- psql) e SOLO per annullare l'introduzione del supporto
-- (migration 20260827100000 → 20260827100005, 20260827120000 → 20260827120001,
--  20260827130000 → 20260827130001 e 20260827140000 → 20260827140003).
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

-- 20260827140002 (RPC) + 20260827140003 (ACL).
-- Il DROP FUNCTION porta via anche i GRANT.
DROP FUNCTION IF EXISTS public.mark_support_ticket_read(uuid);

-- 20260827120000 (RPC) + 20260827120001 (ACL).
-- Il DROP FUNCTION porta via anche i GRANT. Va PRIMA del DROP TABLE: la
-- funzione dichiara `RETURNS public.support_tickets`, quindi dipende dal tipo
-- composito della tabella e il DROP TABLE fallirebbe (o la trascinerebbe via
-- solo con CASCADE, che qui non si usa).
DROP FUNCTION IF EXISTS public.create_support_ticket(uuid, text, uuid, text);

-- 20260827130001 (trigger) + 20260827130000 (funzione).
DROP TRIGGER IF EXISTS support_tickets_derive_closed_at ON public.support_tickets;
DROP FUNCTION IF EXISTS public.support_derive_closed_at();

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

-- 20260827140000 — colonne del segnale "risposta non letta".
-- Ridondanti rispetto al DROP TABLE che segue (l'indice e il CHECK cadono con
-- la tabella), ma esplicite per lo stesso motivo delle policy qui sotto: se il
-- rollback dovesse fermarsi prima del DROP TABLE — tabelle conservate, solo
-- questa feature annullata — queste sono le righe da tenere.
--
-- 20260827140001 ha rimpiazzato il corpo di support_touch_ticket_on_message
-- per scrivere anche last_message_kind. Non serve una CREATE OR REPLACE di
-- ritorno alla versione precedente: la funzione viene comunque droppata piu'
-- sotto. Se invece si volesse annullare SOLO questa feature lasciando in piedi
-- il supporto, va prima riapplicato il corpo di 20260827100001 — altrimenti il
-- trigger scriverebbe su una colonna che questo blocco sta per eliminare.
DROP INDEX IF EXISTS public.idx_support_tickets_tenant_unread;

ALTER TABLE IF EXISTS public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_last_message_kind_check;

ALTER TABLE IF EXISTS public.support_tickets
  DROP COLUMN IF EXISTS last_message_kind;

ALTER TABLE IF EXISTS public.support_tickets
  DROP COLUMN IF EXISTS customer_last_read_at;

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
--     WHERE n.nspname='public' AND (p.proname LIKE 'support!_%' ESCAPE '!'
--                               OR p.proname = 'mark_support_ticket_read'))               AS funzioni,
--   (SELECT count(*) FROM public.permissions WHERE id LIKE 'support.%')                    AS permessi,
--   (SELECT count(*) FROM public.role_permissions WHERE permission_id LIKE 'support.%')    AS mapping;
