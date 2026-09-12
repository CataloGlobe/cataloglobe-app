-- =========================================
-- SEATINGS — la tavolata
-- =========================================
-- Un gruppo di persone che occupa uno o piu' tavoli in una finestra di tempo.
-- E' l'unita' operativa di sala: esiste anche dove il locale non usa gli ordini
-- da QR, quindi e' un'entita' propria e NON una generalizzazione di
-- `order_groups` (che resta il conto, e in un giro successivo diventera' il
-- conto *di una tavolata*).
--
-- Rapporti con cio' che esiste, per non confondere piano e fatto:
--   `reservation_tables` = il PIANO. L'assegnazione decisa prima del servizio.
--   `seating_tables`     = il FATTO. I tavoli realmente occupati.
--   `orders.table_id`    = invariato e obbligatorio: la comanda in cucina vuole
--                          il tavolo anche dentro una tavolata unita.
--
-- Questa migration e' SOLO schema: nessun trigger di assegnazione, nessuna RPC,
-- nessun backfill, nessuna modifica al comportamento esistente.
--
-- Activity-scoped RLS via has_permission('seatings.read|manage', activity_id),
-- come ogni altra entita' di sala. `tenant_id` resta per FK e per le analitiche
-- cross-sede dentro lo stesso tenant.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seatings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  activity_id        uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,

  -- Ignoto finche' l'host non lo dichiara: una tavolata nasce spesso prima che
  -- si sappia in quanti sono davvero. NULL e' un dato, non un buco da riempire
  -- con uno zero o con la capienza del tavolo.
  party_size         int NULL CHECK (party_size IS NULL OR party_size > 0),

  -- Valori in inglese come ogni altro stato del progetto; l'italiano
  -- ("Aperta" / "Chiusa") vive nella UI.
  status             text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','closed')),

  opened_at          timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz NULL,

  -- Una tavolata chiusa dall'operatore e una chiusa dal sistema a fine giornata
  -- non sono lo stesso dato: la prima e' un atto di sala, la seconda e' pulizia.
  -- Distinguerle ora costa una colonna; distinguerle dopo costa un backfill
  -- impossibile.
  closed_reason      text NULL
                     CHECK (closed_reason IN ('operator','auto') OR closed_reason IS NULL),

  -- NULL quando la apre il cliente scansionando un QR: nessun utente autenticato
  -- dietro quell'azione. Stesso pattern di `reservations.created_by_user_id`.
  opened_by_user_id  uuid NULL DEFAULT auth.uid(),

  notes              text NULL,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seatings IS
  'Tavolata: gruppo di persone che occupa uno o piu'' tavoli in una finestra di tempo. Unita'' operativa di sala, indipendente dagli ordini da QR.';

-- Target per le FK composite delle tabelle ponte. Ridondante rispetto alla PK
-- (`id` e' gia' unico), ma Postgres pretende un vincolo unico sulla coppia
-- referenziata. Nessun effetto sul comportamento della tabella.
ALTER TABLE public.seatings
  DROP CONSTRAINT IF EXISTS seatings_id_activity_unique;
ALTER TABLE public.seatings
  ADD CONSTRAINT seatings_id_activity_unique UNIQUE (id, activity_id);

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_seatings_tenant_activity
  ON public.seatings (tenant_id, activity_id);

-- La query calda: "quali tavolate sono aperte in questa sede adesso". Parziale
-- perche' le chiuse crescono senza limite e non servono mai a quella domanda.
CREATE INDEX IF NOT EXISTS idx_seatings_activity_open
  ON public.seatings (activity_id, status)
  WHERE status = 'open';

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger (reuses existing helper)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS seatings_set_updated_at
  ON public.seatings;
CREATE TRIGGER seatings_set_updated_at
  BEFORE UPDATE ON public.seatings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Seed permissions (activity-scoped, operations category)
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('seatings.read',   'activity', 'operations', 'Vedere tavolate della sede'),
  ('seatings.manage', 'activity', 'operations', 'Gestire tavolate della sede')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Map permissions to roles — mirrors orders.read / orders.manage 1:1
-- -----------------------------------------------------------------------------
-- Mappatura letta da `role_permissions` in staging, non dedotta:
--   orders.read   -> owner, admin, manager, staff, viewer
--   orders.manage -> owner, admin, manager, staff
-- La tavolata e' un atto di sala quanto la comanda: chi puo' muovere gli ordini
-- puo' muovere le tavolate, chi guarda e basta guarda e basta.

-- owner: read + manage
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('owner', 'seatings.read'),
  ('owner', 'seatings.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- admin: read + manage
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('admin', 'seatings.read'),
  ('admin', 'seatings.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- manager: read + manage
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('manager', 'seatings.read'),
  ('manager', 'seatings.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- staff: read + manage
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('staff', 'seatings.read'),
  ('staff', 'seatings.manage')
ON CONFLICT (role, permission_id) DO NOTHING;

-- viewer: read only (mirrors orders viewer mapping)
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('viewer', 'seatings.read')
ON CONFLICT (role, permission_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. RLS — activity-scoped via has_permission(permission_id, activity_id)
-- -----------------------------------------------------------------------------
ALTER TABLE public.seatings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read seatings" ON public.seatings;
CREATE POLICY "Roles can read seatings"
  ON public.seatings FOR SELECT TO authenticated
  USING (public.has_permission('seatings.read', activity_id));

DROP POLICY IF EXISTS "Roles can insert seatings" ON public.seatings;
CREATE POLICY "Roles can insert seatings"
  ON public.seatings FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('seatings.manage', activity_id));

DROP POLICY IF EXISTS "Roles can update seatings" ON public.seatings;
CREATE POLICY "Roles can update seatings"
  ON public.seatings FOR UPDATE TO authenticated
  USING      (public.has_permission('seatings.manage', activity_id))
  WITH CHECK (public.has_permission('seatings.manage', activity_id));

DROP POLICY IF EXISTS "Roles can delete seatings" ON public.seatings;
CREATE POLICY "Roles can delete seatings"
  ON public.seatings FOR DELETE TO authenticated
  USING (public.has_permission('seatings.manage', activity_id));

COMMIT;
