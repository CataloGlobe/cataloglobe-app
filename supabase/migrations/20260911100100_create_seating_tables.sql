-- =========================================
-- SEATING_TABLES — ponte tavolata <-> tavoli (molti-a-molti)
-- =========================================
-- I tavoli REALMENTE occupati da una tavolata. Molteplice fin dall'inizio: i
-- tavoli accostati sono la norma, non l'eccezione.
--
-- Da non confondere con `reservation_tables`, che e' il PIANO (l'assegnazione
-- decisa prima del servizio). Questa tabella e' il FATTO. Le due possono
-- divergere e devono poterlo fare: chi arriva senza prenotare non ha un piano,
-- chi arriva in tre invece che in sei viene spostato.
--
-- `tenant_id` e `activity_id` sono DENORMALIZZATI dalla tavolata: servono alle
-- policy RLS (`has_permission` vuole l'activity_id) e all'isolamento tenant
-- senza JOIN dentro la policy. Coerenza garantita dalle FK composite verso
-- `seatings` e `tables`: non e' possibile legare una tavolata a un tavolo di
-- un'altra sede.
--
-- DOPPIA OCCUPAZIONE: un tavolo non dovrebbe stare in due tavolate aperte
-- contemporaneamente, ma qui NON c'e' un vincolo che lo impedisca — e non e'
-- una dimenticanza. L'invariante del progetto e' che la doppia occupazione si
-- MOSTRA, non si blocca: in sala succede davvero (un tavolo liberato di fretta,
-- una tavolata chiusa in ritardo) e un UNIQUE trasformerebbe un'anomalia
-- visibile in un errore che blocca l'operatore nel momento peggiore. L'indice
-- `idx_seating_tables_activity_table` esiste proprio per rendere la domanda
-- "questo tavolo e' in piu' tavolate aperte?" interrogabile a costo basso.
--
-- SOFT DELETE: `tables` usa `deleted_at`, quindi una riga puo' puntare a un
-- tavolo soft-deleted. Qui non si cancella nulla in automatico: lo storico di
-- chi sedeva dove va conservato.
--
-- Permessi: si legge/scrive con quelli della TAVOLATA
-- (`seatings.read` / `seatings.manage`), non con quelli dei tavoli. Occupare un
-- tavolo e' un atto di sala; chi configura la mappa dei tavoli e' un altro
-- mestiere.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seating_tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  activity_id  uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  seating_id   uuid NOT NULL,
  table_id     uuid NOT NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seating_tables_unique_pair UNIQUE (seating_id, table_id)
);

COMMENT ON TABLE public.seating_tables IS
  'Tavoli realmente occupati da una tavolata (molti-a-molti, tavoli accostati). Il fatto, non il piano: il piano e'' reservation_tables.';

-- -----------------------------------------------------------------------------
-- 2. FK composite — legano anche la sede, non solo l'id
-- -----------------------------------------------------------------------------
ALTER TABLE public.seating_tables
  DROP CONSTRAINT IF EXISTS seating_tables_seating_fkey;
ALTER TABLE public.seating_tables
  ADD CONSTRAINT seating_tables_seating_fkey
  FOREIGN KEY (seating_id, activity_id)
  REFERENCES public.seatings(id, activity_id) ON DELETE CASCADE;

-- Stesso ON DELETE di `reservation_tables_table_fkey`: CASCADE. In pratica non
-- scatta quasi mai, perche' `tables` cancella soft (`deleted_at`); vale per la
-- cancellazione hard di una sede intera.
ALTER TABLE public.seating_tables
  DROP CONSTRAINT IF EXISTS seating_tables_table_fkey;
ALTER TABLE public.seating_tables
  ADD CONSTRAINT seating_tables_table_fkey
  FOREIGN KEY (table_id, activity_id)
  REFERENCES public.tables(id, activity_id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_seating_tables_seating_id
  ON public.seating_tables (seating_id);

CREATE INDEX IF NOT EXISTS idx_seating_tables_table_id
  ON public.seating_tables (table_id);

CREATE INDEX IF NOT EXISTS idx_seating_tables_tenant_id
  ON public.seating_tables (tenant_id);

-- Rende interrogabile la doppia occupazione senza impedirla: "in questa sede,
-- quali tavoli compaiono in piu' di una tavolata aperta".
CREATE INDEX IF NOT EXISTS idx_seating_tables_activity_table
  ON public.seating_tables (activity_id, table_id);

-- -----------------------------------------------------------------------------
-- 4. updated_at trigger (reuses existing helper)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS seating_tables_set_updated_at
  ON public.seating_tables;
CREATE TRIGGER seating_tables_set_updated_at
  BEFORE UPDATE ON public.seating_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. RLS — activity-scoped, con i permessi della tavolata
-- -----------------------------------------------------------------------------
ALTER TABLE public.seating_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read seating_tables" ON public.seating_tables;
CREATE POLICY "Roles can read seating_tables"
  ON public.seating_tables FOR SELECT TO authenticated
  USING (public.has_permission('seatings.read', activity_id));

DROP POLICY IF EXISTS "Roles can insert seating_tables" ON public.seating_tables;
CREATE POLICY "Roles can insert seating_tables"
  ON public.seating_tables FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('seatings.manage', activity_id));

DROP POLICY IF EXISTS "Roles can update seating_tables" ON public.seating_tables;
CREATE POLICY "Roles can update seating_tables"
  ON public.seating_tables FOR UPDATE TO authenticated
  USING      (public.has_permission('seatings.manage', activity_id))
  WITH CHECK (public.has_permission('seatings.manage', activity_id));

DROP POLICY IF EXISTS "Roles can delete seating_tables" ON public.seating_tables;
CREATE POLICY "Roles can delete seating_tables"
  ON public.seating_tables FOR DELETE TO authenticated
  USING (public.has_permission('seatings.manage', activity_id));

COMMIT;
