-- =========================================
-- RESERVATIONS — Pacing per fascia oraria (schema)
-- =========================================
-- Primo livello del modello di disponibilita'. Il pacing e' un tetto sugli
-- ARRIVI in una fascia oraria; si affianca alla capienza, non la sostituisce.
-- Domande diverse: la capienza dice quante persone stanno nel locale, il
-- pacing quante ne possono arrivare insieme.
--
-- Due leve indipendenti, si applica la piu' restrittiva:
--   - tetto in COPERTI per fascia   (quattro tavoli da 2 = 8 coperti)
--   - tetto in PRENOTAZIONI per fascia (quattro tavoli da 2 = 4 prenotazioni)
-- Un tavolo da 8 e quattro tavoli da 2 fanno gli stessi coperti ma un carico
-- di sala molto diverso: per questo servono entrambe.
--
-- ── NULL, non 0 ────────────────────────────────────────────────────────────
-- Entrambi i tetti sono NULL di default e NULL significa "nessun limite".
-- Lo 0 come valore di disattivazione e' vietato per costruzione (CHECK > 0):
-- 0 e' falsy, e un `if (limite)` scritto distrattamente trasformerebbe
-- "nessun limite" in "tutto bloccato". Stesso rischio gia' affrontato col
-- cutoff di disdetta, qui chiuso alla radice dal vincolo.
--
-- ── Passo della fascia ─────────────────────────────────────────────────────
-- `reservation_pacing_slot_minutes` NON e' il passo della griglia di orari
-- offerti dal form pubblico (quello vive in `reservationSlots.ts`, oggi 15
-- cablato). Sono cose diverse e restano separate: cambiare domani il passo
-- degli orari offerti non deve spostare i bucket del pacing. Un passo pacing
-- 30 su griglia 15 e' una combinazione legittima — 20:15 cade nel bucket
-- 20:00-20:30.
-- Bucket = floor(minuti_da_mezzanotte / passo) * passo, ancorato alla
-- mezzanotte di `reservation_date`. Le code oltre la mezzanotte appartengono
-- alla loro data di calendario, coerentemente con come sono memorizzate
-- (colonne separate reservation_date / reservation_time).
--
-- ── Comportamento invariato ────────────────────────────────────────────────
-- Con entrambi i tetti NULL — cioe' per OGNI riga esistente — il motore non
-- valuta nulla e il comportamento resta identico a oggi.
--
-- ── Indici ─────────────────────────────────────────────────────────────────
-- Nessun indice nuovo: la query del pacing filtra
-- (activity_id, reservation_date) sugli stati attivi, gia' coperta da
-- `idx_reservations_activity_date_active` (20260607155102).

BEGIN;

ALTER TABLE public.activities
    -- Ampiezza del bucket. NOT NULL con default: il passo esiste sempre,
    -- e' la sua applicazione a essere opzionale (dipende dai due tetti).
    ADD COLUMN reservation_pacing_slot_minutes int NOT NULL DEFAULT 15
        CHECK (reservation_pacing_slot_minutes IN (15, 30, 60)),

    -- NULL = nessun limite sui coperti in arrivo nella fascia.
    ADD COLUMN reservation_pacing_max_covers int NULL
        CHECK (reservation_pacing_max_covers IS NULL
               OR reservation_pacing_max_covers > 0),

    -- NULL = nessun limite sul numero di prenotazioni nella fascia.
    ADD COLUMN reservation_pacing_max_bookings int NULL
        CHECK (reservation_pacing_max_bookings IS NULL
               OR reservation_pacing_max_bookings > 0);

COMMENT ON COLUMN public.activities.reservation_pacing_slot_minutes IS
    'Ampiezza in minuti del bucket di pacing (15|30|60). Indipendente dal passo della griglia di orari offerti dal form pubblico.';
COMMENT ON COLUMN public.activities.reservation_pacing_max_covers IS
    'Tetto di coperti in ARRIVO per fascia. NULL = nessun limite. Mai 0 (vedi CHECK).';
COMMENT ON COLUMN public.activities.reservation_pacing_max_bookings IS
    'Tetto di prenotazioni in ARRIVO per fascia. NULL = nessun limite. Mai 0 (vedi CHECK).';

COMMIT;
