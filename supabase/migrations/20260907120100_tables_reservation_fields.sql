-- ============================================================================
-- tables — campi necessari all'assegnazione delle prenotazioni
-- ============================================================================
--
-- Tutte le colonne sono nullable o hanno un default: nessuna INSERT esistente
-- si rompe, il dominio ordini (resolve-table, submit-order, close-table,
-- generate-table-qrs) non legge nessuna di queste colonne e resta invariato.
--
-- ---------------------------------------------------------------------------
-- RAPPORTO CON `seats` — si AFFIANCA, non si sostituisce
-- ---------------------------------------------------------------------------
-- `seats` e' compilato su 12 tavoli su 13: il ristoratore i posti li mette gia'.
-- Sostituirlo con min/max significherebbe migrare quel dato con una convenzione
-- inventata (seats -> max? -> min? -> entrambi?) e perdere l'informazione di
-- quale sia l'apparecchiatura NORMALE del tavolo.
--
-- Semantica dei tre campi:
--   seats     = posti come il tavolo e' apparecchiato di norma. Resta il campo
--               principale, unico usato dal dominio ordini, unico obbligatorio
--               di fatto nella pagina di configurazione.
--   min_seats = sotto questo numero il tavolo non va assegnato (evita la coppia
--               al tavolo da otto). NULL = nessun minimo, il tavolo accetta
--               qualsiasi gruppo che ci stia.
--   max_seats = massimo raggiungibile aggiungendo sedie. NULL = nessuna sedia
--               in piu': il tetto e' `seats`.
--
-- Il motore di assegnazione (giro successivo) leggera' il tetto come
-- COALESCE(max_seats, seats) e il pavimento come COALESCE(min_seats, 1).
-- Nessun backfill: i 12 tavoli con `seats` valorizzato funzionano da subito con
-- min/max a NULL, ed e' esattamente il comportamento atteso.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tables
    ADD COLUMN IF NOT EXISTS min_seats SMALLINT,
    ADD COLUMN IF NOT EXISTS max_seats SMALLINT,
    ADD COLUMN IF NOT EXISTS combination_group_id UUID,
    ADD COLUMN IF NOT EXISTS assignment_priority SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bookable_online BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tables.seats IS
    'Posti nell''apparecchiatura normale. Campo principale di capienza, usato anche dal dominio ordini.';
COMMENT ON COLUMN public.tables.min_seats IS
    'Capienza minima assegnabile. NULL = nessun minimo.';
COMMENT ON COLUMN public.tables.max_seats IS
    'Capienza massima aggiungendo sedie. NULL = il tetto e'' seats.';
COMMENT ON COLUMN public.tables.combination_group_id IS
    'Gruppo di accostamento fisico. NULL = tavolo non accostabile ad altri (default sicuro).';
COMMENT ON COLUMN public.tables.assignment_priority IS
    'Preferenza a parita'' di condizioni: valore piu'' ALTO = scelto prima. 0 = neutro (default).';
COMMENT ON COLUMN public.tables.bookable_online IS
    'false = tavolo riservato ai walk-in, mai assegnato a una prenotazione online.';

-- Vincoli di coerenza. Tutti tollerano i NULL: valgono solo quando i campi
-- coinvolti sono valorizzati entrambi.
ALTER TABLE public.tables
    DROP CONSTRAINT IF EXISTS tables_min_seats_check;
ALTER TABLE public.tables
    ADD CONSTRAINT tables_min_seats_check CHECK (min_seats IS NULL OR min_seats > 0);

ALTER TABLE public.tables
    DROP CONSTRAINT IF EXISTS tables_max_seats_check;
ALTER TABLE public.tables
    ADD CONSTRAINT tables_max_seats_check CHECK (max_seats IS NULL OR max_seats > 0);

ALTER TABLE public.tables
    DROP CONSTRAINT IF EXISTS tables_min_max_seats_order;
ALTER TABLE public.tables
    ADD CONSTRAINT tables_min_max_seats_order
    CHECK (min_seats IS NULL OR max_seats IS NULL OR min_seats <= max_seats);

-- `seats` deve stare dentro la forbice quando entrambi gli estremi esistono.
ALTER TABLE public.tables
    DROP CONSTRAINT IF EXISTS tables_seats_within_range;
ALTER TABLE public.tables
    ADD CONSTRAINT tables_seats_within_range
    CHECK (
        seats IS NULL
        OR (
            (min_seats IS NULL OR seats >= min_seats)
            AND (max_seats IS NULL OR seats <= max_seats)
        )
    );

ALTER TABLE public.tables
    DROP CONSTRAINT IF EXISTS tables_assignment_priority_check;
ALTER TABLE public.tables
    ADD CONSTRAINT tables_assignment_priority_check
    CHECK (assignment_priority >= 0 AND assignment_priority <= 100);

-- FK COMPOSITA: il gruppo di accostamento deve appartenere alla STESSA sede del
-- tavolo. Una FK semplice su (id) garantirebbe solo l'esistenza del gruppo, non
-- l'appartenenza — si potrebbe accostare un tavolo a un gruppo di un altro
-- locale. ON DELETE SET NULL: cancellare il gruppo scioglie l'accostamento e i
-- tavoli tornano al default sicuro (non combinabili), non si cancella nulla.
ALTER TABLE public.tables
    DROP CONSTRAINT IF EXISTS tables_combination_group_id_fkey;
ALTER TABLE public.tables
    ADD CONSTRAINT tables_combination_group_id_fkey
    FOREIGN KEY (combination_group_id, activity_id)
    REFERENCES public.table_combination_groups(id, activity_id)
    ON DELETE SET NULL (combination_group_id);

CREATE INDEX IF NOT EXISTS idx_tables_combination_group_id
    ON public.tables (combination_group_id)
    WHERE deleted_at IS NULL;

-- Indice per il futuro motore di assegnazione: candidati prenotabili per sede.
CREATE INDEX IF NOT EXISTS idx_tables_bookable
    ON public.tables (activity_id, bookable_online)
    WHERE deleted_at IS NULL AND maintenance_mode = false;
