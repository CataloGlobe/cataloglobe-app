-- =============================================================================
-- CataloGlobe V2 — Test di concorrenza del pacing (due sessioni)
--
-- NON e' una migration. NON si esegue tutto d'un fiato: e' una procedura in
-- cinque blocchi da lanciare a mano, due dei quali in una SECONDA sessione.
--
-- ── PERCHE' ESISTE ──────────────────────────────────────────────────────────
-- E' il test che giustifica l'intera scelta architetturale. Il pacing vive
-- dentro `place_online_reservation` e non fuori perche' `pg_advisory_xact_lock`
-- e' transaction-scoped: due richieste simultanee sulla stessa fascia devono
-- vedersi a vicenda. Se il gate fosse fuori dal lock, due prenotazioni
-- potrebbero superarlo entrambe — e il bug sarebbe raro, non riproducibile e
-- invisibile in un test a sessione singola.
-- Questo script rende quella condizione riproducibile a comando.
--
-- ── PERCHE' A MANO ──────────────────────────────────────────────────────────
-- Servono due transazioni realmente contemporanee. `dblink` sarebbe la via per
-- automatizzarlo, ma non e' installato e installarlo per un test significa una
-- migration e un'estensione in piu' in produzione: non vale il prezzo.
--
-- ── DOVE ────────────────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, progetto STAGING. NON produzione.
-- Servono DUE schede del SQL Editor: sessione A e sessione B.
-- Da eseguire DOPO aver applicato 20260831140000 e 20260831150000..150003.
--
-- ── ATTENZIONE: QUESTO SCRIPT COMMITTA ──────────────────────────────────────
-- A differenza degli altri due script di prenotazioni, qui NON si puo' usare
-- un unico BEGIN…ROLLBACK: la sessione B deve VEDERE la configurazione scritta
-- da A, quindi il setup va committato.
-- La configurazione originale della sede viene salvata in
-- `public._pacing_concurrency_backup` e ripristinata dal BLOCCO 5.
-- ⚠️  ESEGUI SEMPRE IL BLOCCO 5, anche se interrompi a meta': finche' non gira,
--     la sede di prova resta con il pacing a 1 prenotazione per fascia.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOCCO 1 — sessione A — setup (committa)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public._pacing_concurrency_backup (
    activity_id                     uuid PRIMARY KEY,
    tenant_id                       uuid NOT NULL,
    reservation_capacity            int,
    reservation_duration_minutes    int,
    reservation_confirmation_mode   text,
    reservation_overbooking_form    text,
    reservation_pacing_slot_minutes int,
    reservation_pacing_max_covers   int,
    reservation_pacing_max_bookings int
);

INSERT INTO public._pacing_concurrency_backup
SELECT a.id, a.tenant_id,
       a.reservation_capacity, a.reservation_duration_minutes,
       a.reservation_confirmation_mode, a.reservation_overbooking_form,
       a.reservation_pacing_slot_minutes,
       a.reservation_pacing_max_covers, a.reservation_pacing_max_bookings
FROM public.activities a
WHERE a.enable_reservations
  AND public.activity_has_feature(a.id, 'table_reservation')
ORDER BY a.created_at
LIMIT 1
ON CONFLICT (activity_id) DO NOTHING;

-- Tetto 1 prenotazione per fascia da 15 minuti. Capienza NULL: il blocco deve
-- arrivare dal pacing, non dalla capienza.
UPDATE public.activities a
SET reservation_capacity             = NULL,
    reservation_duration_minutes     = 120,
    reservation_confirmation_mode    = 'manuale',
    reservation_overbooking_form     = 'hard',
    reservation_pacing_slot_minutes  = 15,
    reservation_pacing_max_covers    = NULL,
    reservation_pacing_max_bookings  = 1
FROM public._pacing_concurrency_backup b
WHERE a.id = b.activity_id;

DELETE FROM public.reservations r
USING public._pacing_concurrency_backup b
WHERE r.activity_id = b.activity_id
  AND r.reservation_date = DATE '2099-05-10';

-- Annota questo id: serve nei blocchi 2 e 3.
SELECT activity_id AS sede_di_prova FROM public._pacing_concurrency_backup;


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOCCO 2 — sessione A — apre la transazione e NON committa
--
-- Atteso: una riga con status='pending', reason NULL.
-- Al termine la transazione resta APERTA: tiene il lock. Non chiudere la
-- scheda, non lanciare altro qui dentro fino al BLOCCO 4.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT p.status, p.reason
FROM public.place_online_reservation(
    (SELECT activity_id FROM public._pacing_concurrency_backup),
    DATE '2099-05-10', TIME '20:00', 2,
    'Sessione A', 'concorrenza@example.invalid', '+390000000001', NULL, 'online'
) p;

-- STOP. Passa alla sessione B.


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOCCO 3 — sessione B (SECONDA scheda) — stessa fascia, simultaneo
--
-- Atteso: la query RESTA IN ATTESA. E' il comportamento corretto: B ha chiesto
-- lo stesso `pg_advisory_xact_lock` che A sta tenendo. Se invece tornasse
-- subito con un risultato, il gate NON sarebbe sotto il lock → bug.
--
-- Lasciala girare e torna alla sessione A.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT p.status, p.reason
FROM public.place_online_reservation(
    (SELECT activity_id FROM public._pacing_concurrency_backup),
    DATE '2099-05-10', TIME '20:05', 2,
    'Sessione B', 'concorrenza@example.invalid', '+390000000002', NULL, 'online'
) p;

-- 20:05 e non 20:00: stesso bucket 20:00-20:15, orario diverso. Cosi' il test
-- non puo' passare per un caso fortuito di riga identica.


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOCCO 4 — sessione A — sblocca
-- ═════════════════════════════════════════════════════════════════════════════

COMMIT;

-- Ora guarda la sessione B: si e' sbloccata.
--
--   ESITO ATTESO   → status='full', reason='pacing_bookings'
--                    B ha visto la riga di A e ha rispettato il tetto.
--
--   ESITO FALLITO  → status='pending'
--                    Sono passate entrambe: il tetto di 1 e' stato superato da
--                    due richieste simultanee. E' esattamente il bug che la
--                    Fase A doveva prevenire.


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOCCO 5 — teardown — OBBLIGATORIO (qualsiasi sessione)
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM public.reservations r
USING public._pacing_concurrency_backup b
WHERE r.activity_id = b.activity_id
  AND r.reservation_date = DATE '2099-05-10';

UPDATE public.activities a
SET reservation_capacity             = b.reservation_capacity,
    reservation_duration_minutes     = b.reservation_duration_minutes,
    reservation_confirmation_mode    = b.reservation_confirmation_mode,
    reservation_overbooking_form     = b.reservation_overbooking_form,
    reservation_pacing_slot_minutes  = b.reservation_pacing_slot_minutes,
    reservation_pacing_max_covers    = b.reservation_pacing_max_covers,
    reservation_pacing_max_bookings  = b.reservation_pacing_max_bookings
FROM public._pacing_concurrency_backup b
WHERE a.id = b.activity_id;

DROP TABLE public._pacing_concurrency_backup;

COMMIT;

-- Verifica finale: deve restituire zero righe.
SELECT count(*) AS righe_di_prova_rimaste
FROM public.reservations
WHERE reservation_date = DATE '2099-05-10';
