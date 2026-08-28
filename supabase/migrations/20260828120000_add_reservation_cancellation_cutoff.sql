-- =============================================================================
-- activities.reservation_cancellation_cutoff_minutes
-- =============================================================================
--
-- Il cliente riceve nelle email di ricevuta e conferma un link firmato che gli
-- permette di annullare la prenotazione da solo, senza login. Questa colonna
-- dice, per sede, quanti minuti prima dell'orario prenotato il link smette di
-- annullare: oltre la soglia la pagina mostra il recapito della sede e invita a
-- telefonare. Una disdetta all'ultimo minuto e' un problema di sala, e si
-- risolve con una telefonata, non con un form.
--
-- ── Semantica dei valori ────────────────────────────────────────────────────
--   0      = NESSUN limite: annullabile sempre. NON significa "mai
--            annullabile". Il ramo e' esplicito anche nel codice
--            (supabase/functions/_shared/reservationCancellation.ts) ed e'
--            coperto da un test dedicato, perche' l'interpretazione invertita
--            e' quella che passerebbe inosservata bloccando tutti i clienti.
--   120    = default: due ore prima. Valore scelto come compromesso tra il
--            preavviso utile alla sala e la liberta' del cliente.
--   10080  = 7 giorni, tetto di sanita' contro valori inseriti per errore
--            (un cutoff piu' lungo renderebbe il link inutile da subito).
--
-- Nessuna colonna di stato aggiuntiva: il token di disdetta non ha scadenza
-- propria, e cio' che governa l'annullabilita' e' lo stato della prenotazione
-- (macchina a stati) piu' questo cutoff, entrambi rivalutati server-side ad
-- ogni chiamata.
--
-- Nessun impatto su RLS: la colonna vive su `activities`, gia' protetta dalle
-- policy esistenti, e viene letta dall'edge function con service_role.
-- =============================================================================

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS reservation_cancellation_cutoff_minutes integer NOT NULL DEFAULT 120;

ALTER TABLE public.activities
    DROP CONSTRAINT IF EXISTS activities_reservation_cancellation_cutoff_check;

ALTER TABLE public.activities
    ADD CONSTRAINT activities_reservation_cancellation_cutoff_check
    CHECK (reservation_cancellation_cutoff_minutes BETWEEN 0 AND 10080);

COMMENT ON COLUMN public.activities.reservation_cancellation_cutoff_minutes IS
    'Minuti prima dell''orario prenotato entro cui il cliente puo'' ancora annullare dal link firmato ricevuto via email. 0 = nessun limite (sempre annullabile), non "mai annullabile". Default 120. Massimo 10080 (7 giorni).';
