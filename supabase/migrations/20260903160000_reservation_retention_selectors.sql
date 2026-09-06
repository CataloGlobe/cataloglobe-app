-- =============================================================================
-- RETENTION PRENOTAZIONI (24 mesi) — selettori
-- =============================================================================
-- Due funzioni di sola lettura usate da `purge-reservation-data`. Stanno qui e
-- non nell'edge function perche' entrambe hanno bisogno di un NOT EXISTS, che
-- PostgREST non sa esprimere: farlo lato client significherebbe scaricare tutta
-- la rubrica per sottrarne le visite recenti.
--
-- Il criterio e' l'ULTIMA prenotazione della persona, non la singola riga:
-- finche' un cliente torna, tutto il suo storico resta. Cancellare le visite
-- vecchie di un abituale renderebbe la rubrica bugiarda.
--
-- La REVOKE/GRANT sta nel file successivo (20260903160001): CREATE FUNCTION e
-- REVOKE nello stesso file fanno fallire `supabase db push` con 42601.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Profili scaduti — nessuna prenotazione dalla soglia in poi
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_expired_reservation_guests(
  p_cutoff date,
  p_limit  integer
)
RETURNS TABLE (guest_id uuid, tenant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  -- Colonne sempre qualificate con l'alias: le colonne OUT della RETURNS TABLE
  -- hanno gli stessi nomi delle colonne lette, e senza qualifica il planner non
  -- saprebbe a quale ci si riferisce.
  SELECT g.id, g.tenant_id
  FROM public.reservation_guests g
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.reservations r
    WHERE r.guest_id = g.id
      AND r.reservation_date >= p_cutoff
  )
  ORDER BY g.created_at
  LIMIT p_limit;
$function$;

COMMENT ON FUNCTION public.list_expired_reservation_guests(date, integer) IS
  'Profili rubrica la cui ultima prenotazione e'' anteriore a p_cutoff. Usata da purge-reservation-data (retention 24 mesi).';

-- -----------------------------------------------------------------------------
-- 2. Prenotazioni orfane scadute — nessun profilo a cui agganciarsi
-- -----------------------------------------------------------------------------
-- Sono le prenotazioni il cui telefono non era normalizzabile in E.164: per
-- loro il criterio torna a essere la data della singola riga. NON e' un caso
-- residuo — oggi su staging e' 25 righe su 26 — e riceve lo stesso trattamento.
--
-- Il filtro sul segnaposto e' cio' che rende il job IDEMPOTENTE: una riga gia'
-- anonimizzata ha guest_id NULL e data vecchia, quindi rientrerebbe nella
-- selezione a ogni esecuzione, all'infinito.
--
-- ⚠️ SYNC: il letterale '[dato rimosso]' e' duplicato in
-- supabase/functions/_shared/reservationRetention.ts (ANONYMIZED_PLACEHOLDER).
-- Cambiarne uno solo fa rileggere ogni riga gia' trattata a ogni run.
CREATE OR REPLACE FUNCTION public.list_expired_orphan_reservations(
  p_cutoff date,
  p_limit  integer
)
RETURNS TABLE (reservation_id uuid, tenant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT r.id, r.tenant_id
  FROM public.reservations r
  WHERE r.guest_id IS NULL
    AND r.reservation_date < p_cutoff
    AND r.customer_name <> '[dato rimosso]'
  ORDER BY r.reservation_date
  LIMIT p_limit;
$function$;

COMMENT ON FUNCTION public.list_expired_orphan_reservations(date, integer) IS
  'Prenotazioni senza profilo, anteriori a p_cutoff e non gia'' anonimizzate. Usata da purge-reservation-data (retention 24 mesi).';
