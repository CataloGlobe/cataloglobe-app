-- =========================================
-- RESERVATIONS — Pacing (1/4): DROP della firma v1
-- =========================================
-- La v2 aggiunge la colonna OUT `reason` alla RETURNS TABLE. Postgres non
-- consente di cambiare il tipo di ritorno con CREATE OR REPLACE: serve un
-- DROP esplicito.
--
-- La lista degli argomenti resta identica, quindi non nasce un overload: la
-- v2 (file 2/4) rioccupa esattamente la stessa firma.
--
-- ── PERCHE' QUATTRO FILE ────────────────────────────────────────────────────
-- `supabase db push` invia ogni migration come singolo prepared statement:
-- piu' comandi nello stesso file → SQLSTATE 42601. Per le funzioni valgono
-- DROP / CREATE / REVOKE / GRANT ognuno nel proprio file, e CREATE FUNCTION
-- senza wrapper BEGIN…COMMIT (il wrapper stesso conta come statement).
-- I tre REVOKE della v1 stanno in un unico comando grazie alla lista di ruoli.
--
-- ── FINESTRA ────────────────────────────────────────────────────────────────
-- Fra questo file e il 2/4 la funzione non esiste. `db push` li applica in
-- sequenza nella stessa sessione, quindi la finestra e' di millisecondi; un
-- submit online che ci cadesse dentro riceverebbe un errore e il cliente
-- ritenterebbe. Nessuna riga a rischio: la funzione o c'e' o non c'e', non
-- esiste uno stato intermedio in cui inserisce male.

DROP FUNCTION IF EXISTS public.place_online_reservation(
    uuid, date, time, int, text, text, text, text, text
);
