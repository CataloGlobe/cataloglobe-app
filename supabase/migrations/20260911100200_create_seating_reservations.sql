-- =========================================
-- SEATING_RESERVATIONS — ponte tavolata <-> prenotazioni (molti-a-molti)
-- =========================================
-- Da quali prenotazioni nasce una tavolata. Molti-a-molti DI PROPOSITO, non per
-- simmetria: due prenotazioni distinte possono formare una sola tavolata (due
-- coppie che si conoscono, un tavolone), e una prenotazione puo' essere servita
-- da piu' tavolate in casi di riorganizzazione della sala. Un `reservation_id`
-- singolo su `seatings` costerebbe una migration dolorosa al primo caso reale —
-- lo stesso errore gia' fatto con `reservations.table_id`, rimasto inerte.
--
-- Una tavolata senza righe qui e' normale e frequente: e' il walk-in, chi entra
-- senza aver prenotato.
--
-- `tenant_id` e `activity_id` sono DENORMALIZZATI per le policy RLS, come nelle
-- altre ponti. Coerenza garantita dalle FK composite: non e' possibile legare
-- una tavolata a una prenotazione di un'altra sede.
--
-- Nessun `updated_at`: la riga e' un fatto puntuale (questa prenotazione e'
-- confluita in questa tavolata). Non si modifica, si crea o si toglie.
--
-- Permessi: quelli della TAVOLATA (`seatings.read` / `seatings.manage`).

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seating_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  activity_id     uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  seating_id      uuid NOT NULL,
  reservation_id  uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seating_reservations_unique_pair UNIQUE (seating_id, reservation_id)
);

COMMENT ON TABLE public.seating_reservations IS
  'Prenotazioni confluite in una tavolata (molti-a-molti). Assente per i walk-in, multipla quando piu'' prenotazioni siedono insieme.';

-- -----------------------------------------------------------------------------
-- 2. FK composite — legano anche la sede, non solo l'id
-- -----------------------------------------------------------------------------
ALTER TABLE public.seating_reservations
  DROP CONSTRAINT IF EXISTS seating_reservations_seating_fkey;
ALTER TABLE public.seating_reservations
  ADD CONSTRAINT seating_reservations_seating_fkey
  FOREIGN KEY (seating_id, activity_id)
  REFERENCES public.seatings(id, activity_id) ON DELETE CASCADE;

ALTER TABLE public.seating_reservations
  DROP CONSTRAINT IF EXISTS seating_reservations_reservation_fkey;
ALTER TABLE public.seating_reservations
  ADD CONSTRAINT seating_reservations_reservation_fkey
  FOREIGN KEY (reservation_id, activity_id)
  REFERENCES public.reservations(id, activity_id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_seating_reservations_seating_id
  ON public.seating_reservations (seating_id);

CREATE INDEX IF NOT EXISTS idx_seating_reservations_reservation_id
  ON public.seating_reservations (reservation_id);

CREATE INDEX IF NOT EXISTS idx_seating_reservations_tenant_id
  ON public.seating_reservations (tenant_id);

-- -----------------------------------------------------------------------------
-- 4. RLS — activity-scoped, con i permessi della tavolata
-- -----------------------------------------------------------------------------
ALTER TABLE public.seating_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read seating_reservations" ON public.seating_reservations;
CREATE POLICY "Roles can read seating_reservations"
  ON public.seating_reservations FOR SELECT TO authenticated
  USING (public.has_permission('seatings.read', activity_id));

DROP POLICY IF EXISTS "Roles can insert seating_reservations" ON public.seating_reservations;
CREATE POLICY "Roles can insert seating_reservations"
  ON public.seating_reservations FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('seatings.manage', activity_id));

DROP POLICY IF EXISTS "Roles can update seating_reservations" ON public.seating_reservations;
CREATE POLICY "Roles can update seating_reservations"
  ON public.seating_reservations FOR UPDATE TO authenticated
  USING      (public.has_permission('seatings.manage', activity_id))
  WITH CHECK (public.has_permission('seatings.manage', activity_id));

DROP POLICY IF EXISTS "Roles can delete seating_reservations" ON public.seating_reservations;
CREATE POLICY "Roles can delete seating_reservations"
  ON public.seating_reservations FOR DELETE TO authenticated
  USING (public.has_permission('seatings.manage', activity_id));

COMMIT;
