-- ============================================================================
-- reservation_tables — ponte prenotazione <-> tavoli (molti-a-molti)
-- ============================================================================
--
-- Multipla fin dall'inizio: i tavoli accostati sono la norma, una prenotazione
-- da 6 puo' occupare due tavoli da 3. Una FK singola su `reservations` avrebbe
-- richiesto una migration di conversione al primo caso reale.
--
-- `tenant_id` e `activity_id` sono DENORMALIZZATI dalla prenotazione: servono
-- alle policy RLS (`has_permission` vuole l'activity_id) e all'isolamento
-- tenant senza JOIN dentro la policy. Coerenza garantita dalle FK composite
-- verso `reservations` e `tables`: non e' possibile legare una prenotazione a
-- un tavolo di un'altra sede.
--
-- PERMESSI: si legge/scrive con i permessi delle PRENOTAZIONI
-- (`reservations.read` / `reservations.manage`), non con quelli dei tavoli.
-- L'assegnazione e' un atto di gestione della prenotazione; chi configura la
-- sala non deve poter spostare le prenotazioni altrui.
--
-- SOFT DELETE: `tables` usa `deleted_at`, quindi una riga di questa tabella puo'
-- puntare a un tavolo soft-deleted. Il motore di assegnazione (giro successivo)
-- filtra `deleted_at IS NULL`; qui non si cancella nulla in automatico perche'
-- lo storico di chi sedeva dove va conservato.
--
-- NOTA su `reservations.table_id` (aggiunta a giugno, mai usata, 0 righe
-- valorizzate): resta dov'e'. Non si elimina in questa migration per tre motivi:
--   1. e' inerte e non fa danno (nessun lettore, nessuno scrittore, FK SET NULL);
--   2. droppare una colonna e' irreversibile e va isolato in una migration sua,
--      con il suo momento di verifica, non nascosto dentro una che ne aggiunge;
--   3. `database.types.ts` e' generato: la rimozione va coordinata con la
--      rigenerazione dei tipi, che e' un cambiamento di superficie a se'.
-- Fino ad allora: NON scriverci. La verita' e' questa tabella.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reservation_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    reservation_id UUID NOT NULL,
    table_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reservation_tables_unique_pair UNIQUE (reservation_id, table_id)
);

COMMENT ON TABLE public.reservation_tables IS
    'Tavoli assegnati a una prenotazione (molti-a-molti, tavoli accostati). Sostituisce reservations.table_id, che resta inerte.';

-- Target delle FK composite. Ridondanti rispetto alle PK (id e' gia' unico),
-- ma Postgres pretende un vincolo unico sulla coppia referenziata.
-- Nessun effetto sul comportamento esistente di `reservations` / `tables`.
ALTER TABLE public.reservations
    DROP CONSTRAINT IF EXISTS reservations_id_activity_unique;
ALTER TABLE public.reservations
    ADD CONSTRAINT reservations_id_activity_unique UNIQUE (id, activity_id);

ALTER TABLE public.tables
    DROP CONSTRAINT IF EXISTS tables_id_activity_unique;
ALTER TABLE public.tables
    ADD CONSTRAINT tables_id_activity_unique UNIQUE (id, activity_id);

-- FK composite: legano anche la sede, non solo l'id.
ALTER TABLE public.reservation_tables
    DROP CONSTRAINT IF EXISTS reservation_tables_reservation_fkey;
ALTER TABLE public.reservation_tables
    ADD CONSTRAINT reservation_tables_reservation_fkey
    FOREIGN KEY (reservation_id, activity_id)
    REFERENCES public.reservations(id, activity_id) ON DELETE CASCADE;

ALTER TABLE public.reservation_tables
    DROP CONSTRAINT IF EXISTS reservation_tables_table_fkey;
ALTER TABLE public.reservation_tables
    ADD CONSTRAINT reservation_tables_table_fkey
    FOREIGN KEY (table_id, activity_id)
    REFERENCES public.tables(id, activity_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reservation_tables_reservation_id
    ON public.reservation_tables (reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_tables_table_id
    ON public.reservation_tables (table_id);
CREATE INDEX IF NOT EXISTS idx_reservation_tables_tenant_id
    ON public.reservation_tables (tenant_id);

DROP TRIGGER IF EXISTS set_updated_at_reservation_tables ON public.reservation_tables;
CREATE TRIGGER set_updated_at_reservation_tables
    BEFORE UPDATE ON public.reservation_tables
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read reservation_tables" ON public.reservation_tables;
CREATE POLICY "Roles can read reservation_tables"
    ON public.reservation_tables FOR SELECT TO authenticated
    USING (public.has_permission('reservations.read', activity_id));

DROP POLICY IF EXISTS "Roles can insert reservation_tables" ON public.reservation_tables;
CREATE POLICY "Roles can insert reservation_tables"
    ON public.reservation_tables FOR INSERT TO authenticated
    WITH CHECK (public.has_permission('reservations.manage', activity_id));

DROP POLICY IF EXISTS "Roles can update reservation_tables" ON public.reservation_tables;
CREATE POLICY "Roles can update reservation_tables"
    ON public.reservation_tables FOR UPDATE TO authenticated
    USING (public.has_permission('reservations.manage', activity_id))
    WITH CHECK (public.has_permission('reservations.manage', activity_id));

DROP POLICY IF EXISTS "Roles can delete reservation_tables" ON public.reservation_tables;
CREATE POLICY "Roles can delete reservation_tables"
    ON public.reservation_tables FOR DELETE TO authenticated
    USING (public.has_permission('reservations.manage', activity_id));
