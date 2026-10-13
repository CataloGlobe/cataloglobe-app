-- =============================================================================
-- Officina, fase (a): le regole. Solo aggiunte, il codice di oggi non le legge.
-- =============================================================================
--
-- Pacchetto database dell'Officina (brain: wiki/prodotto/officina-pacchetto-
-- database.md), passi (a) di M1, M2, M3, M5. Scelte di Lorenzo del 2026-10-13.
--
--   M1  schedule_slots: le fasce di una regola, in minuti. end_minute oltre
--       1440 = la fascia passa la mezzanotte e appartiene al giorno in cui
--       comincia («venerdì 19:00-02:00» vale anche sabato fino alle 2).
--   M2  schedule_slot_targets: una fascia può valere solo per alcune sedi della
--       regola. Punta alla riga di schedule_targets, non alla sede: la fascia
--       resta dentro le sedi della regola. Nessuna riga = tutte le sedi.
--   M3  rule_type 'menu' e 'style' (al posto di 'layout' dal passo b) con le
--       figlie schedule_menu e schedule_style. Menù o stile usato da una regola:
--       la cancellazione resta bloccata, come oggi in schedule_layout.
--   M5  schedules.overlap_mode e on_air_since; schedule_targets.overlap_mode
--       per la scelta diversa in una sede (NULL = vale quella della regola).
--
-- Cosa non cambia: nessuna riga nuova nelle tabelle nuove; giudice, resolver,
-- RPC e Calendario leggono le colonne di oggi. on_air_since si riempie con
-- created_at (il passo b la riscrive per emulare l'ordine di oggi).
--
-- Accesso: come schedule_layout (20260930150000, 20261007170000). PERMISSIVE
-- per azienda, RESTRICTIVE «Parent same tenant» e can_write_schedule. Su
-- schedule_slot_targets la coerenza fascia-sede-regola la tengono due FK
-- composte su schedule_id (le FK non passano dall'RLS: niente sottoquery su
-- schedule_targets, che si legge solo con can_read_schedule_target).
--
-- Indietro (staging, prima del passo b):
--   DROP TABLE public.schedule_slot_targets, public.schedule_slots,
--              public.schedule_menu, public.schedule_style;
--   ALTER TABLE public.schedule_targets DROP COLUMN overlap_mode;
--   ALTER TABLE public.schedules DROP COLUMN overlap_mode,
--                                DROP COLUMN on_air_since;
--   ALTER TABLE public.schedules DROP CONSTRAINT schedules_rule_type_check,
--     ADD CONSTRAINT schedules_rule_type_check CHECK (rule_type = ANY
--     (ARRAY['layout','price','visibility','featured']));
--   ALTER TABLE public.schedule_targets
--     DROP CONSTRAINT schedule_targets_id_schedule_id_key;
-- =============================================================================

-- M3: tipi nuovi ---------------------------------------------------------------
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_rule_type_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_rule_type_check
  CHECK (rule_type = ANY (ARRAY['layout'::text, 'menu'::text, 'style'::text,
                                'price'::text, 'visibility'::text, 'featured'::text]));

-- M5: la scelta dell'utente e «l'ultima salvata» --------------------------------
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS overlap_mode text;
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_overlap_mode_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_overlap_mode_check
  CHECK (
    overlap_mode IS NULL
    OR (rule_type IN ('menu', 'layout') AND overlap_mode IN ('together', 'replace'))
    OR (rule_type = 'style' AND overlap_mode IN ('replace', 'keep'))
  );

ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS on_air_since timestamptz;
UPDATE public.schedules SET on_air_since = created_at WHERE on_air_since IS NULL;
ALTER TABLE public.schedules ALTER COLUMN on_air_since SET DEFAULT now();
ALTER TABLE public.schedules ALTER COLUMN on_air_since SET NOT NULL;

-- Il tipo della regola non si vede da qui: il valore giusto per tipo lo
-- controlla la RPC di scrittura (passo b).
ALTER TABLE public.schedule_targets ADD COLUMN IF NOT EXISTS overlap_mode text;
ALTER TABLE public.schedule_targets DROP CONSTRAINT IF EXISTS schedule_targets_overlap_mode_check;
ALTER TABLE public.schedule_targets ADD CONSTRAINT schedule_targets_overlap_mode_check
  CHECK (overlap_mode IS NULL OR overlap_mode IN ('together', 'replace', 'keep'));

-- Serve alla FK composta di schedule_slot_targets (che poi ne dipende: non si
-- toglie e rimette, si aggiunge solo se manca).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.schedule_targets'::regclass
                   AND conname = 'schedule_targets_id_schedule_id_key') THEN
    ALTER TABLE public.schedule_targets ADD CONSTRAINT schedule_targets_id_schedule_id_key
      UNIQUE (id, schedule_id);
  END IF;
END $$;

-- M1: fasce --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_slots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  schedule_id   uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  -- Stessa convenzione di schedules.days_of_week: NULL = tutti, 0 = domenica.
  days_of_week  integer[],
  start_minute  integer NOT NULL,
  end_minute    integer NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_slots_id_schedule_id_key UNIQUE (id, schedule_id),
  CONSTRAINT schedule_slots_start_minute_check
    CHECK (start_minute >= 0 AND start_minute < 1440),
  CONSTRAINT schedule_slots_end_minute_check
    CHECK (end_minute > start_minute AND end_minute <= start_minute + 1440),
  CONSTRAINT schedule_slots_days_of_week_check
    CHECK (days_of_week IS NULL OR days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6])
);

CREATE INDEX IF NOT EXISTS schedule_slots_schedule_id_idx
  ON public.schedule_slots (schedule_id, sort_order);

-- M2: sedi della fascia ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_slot_targets (
  slot_id             uuid NOT NULL,
  schedule_target_id  uuid NOT NULL,
  schedule_id         uuid NOT NULL,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slot_id, schedule_target_id),
  CONSTRAINT schedule_slot_targets_slot_fkey
    FOREIGN KEY (slot_id, schedule_id)
    REFERENCES public.schedule_slots (id, schedule_id) ON DELETE CASCADE,
  CONSTRAINT schedule_slot_targets_target_fkey
    FOREIGN KEY (schedule_target_id, schedule_id)
    REFERENCES public.schedule_targets (id, schedule_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS schedule_slot_targets_target_idx
  ON public.schedule_slot_targets (schedule_target_id);
CREATE INDEX IF NOT EXISTS schedule_slot_targets_schedule_idx
  ON public.schedule_slot_targets (schedule_id);

-- M3: menù e stile --------------------------------------------------------------
-- catalog_id e style_id senza azione alla cancellazione: un menù o uno stile
-- usato da una regola non si cancella (deciso da Lorenzo il 2026-10-13).
CREATE TABLE IF NOT EXISTS public.schedule_menu (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  schedule_id  uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  catalog_id   uuid NOT NULL REFERENCES public.catalogs(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_menu_schedule_id_key UNIQUE (schedule_id)
);
CREATE INDEX IF NOT EXISTS schedule_menu_catalog_id_idx
  ON public.schedule_menu (catalog_id);

CREATE TABLE IF NOT EXISTS public.schedule_style (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  schedule_id  uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  style_id     uuid NOT NULL REFERENCES public.styles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_style_schedule_id_key UNIQUE (schedule_id)
);
CREATE INDEX IF NOT EXISTS schedule_style_style_id_idx
  ON public.schedule_style (style_id);

-- RLS ----------------------------------------------------------------------------
ALTER TABLE public.schedule_slots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slot_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_menu         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_style        ENABLE ROW LEVEL SECURITY;

-- PERMISSIVE per azienda, uguali per le quattro tabelle.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_slots', 'schedule_slot_targets',
                           'schedule_menu', 'schedule_style']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant select own rows" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Tenant select own rows" ON public.%I
      FOR SELECT TO authenticated
      USING (tenant_id IN (SELECT public.get_my_tenant_ids()))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Tenant insert own rows" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Tenant insert own rows" ON public.%I
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Tenant update own rows" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Tenant update own rows" ON public.%I
      FOR UPDATE TO authenticated
      USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
      WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Tenant delete own rows" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Tenant delete own rows" ON public.%I
      FOR DELETE TO authenticated
      USING (tenant_id IN (SELECT public.get_my_tenant_ids()))', t);

    -- RESTRICTIVE: si scrive solo se si può scrivere la regola (20261007170000).
    EXECUTE format('DROP POLICY IF EXISTS "Schedule writable on insert" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Schedule writable on insert" ON public.%I
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.can_write_schedule(schedule_id))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Schedule writable on update" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Schedule writable on update" ON public.%I
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (public.can_write_schedule(schedule_id))
      WITH CHECK (public.can_write_schedule(schedule_id))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Schedule writable on delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Schedule writable on delete" ON public.%I
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (public.can_write_schedule(schedule_id))', t);
  END LOOP;
END $$;

-- RESTRICTIVE «Parent same tenant» (20260930150000): la regola, il menù e lo
-- stile sono dell'azienda della riga. Su schedule_slot_targets basta la regola:
-- fascia e sede sono legate alla stessa regola dalle FK composte.
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.schedule_slots;
CREATE POLICY "Parent same tenant on insert" ON public.schedule_slots
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.schedules p
                      WHERE p.id = schedule_slots.schedule_id
                        AND p.tenant_id = schedule_slots.tenant_id));
DROP POLICY IF EXISTS "Parent same tenant on update" ON public.schedule_slots;
CREATE POLICY "Parent same tenant on update" ON public.schedule_slots
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (EXISTS (SELECT 1 FROM public.schedules p
                      WHERE p.id = schedule_slots.schedule_id
                        AND p.tenant_id = schedule_slots.tenant_id));

DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.schedule_slot_targets;
CREATE POLICY "Parent same tenant on insert" ON public.schedule_slot_targets
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.schedules p
                      WHERE p.id = schedule_slot_targets.schedule_id
                        AND p.tenant_id = schedule_slot_targets.tenant_id));
DROP POLICY IF EXISTS "Parent same tenant on update" ON public.schedule_slot_targets;
CREATE POLICY "Parent same tenant on update" ON public.schedule_slot_targets
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (EXISTS (SELECT 1 FROM public.schedules p
                      WHERE p.id = schedule_slot_targets.schedule_id
                        AND p.tenant_id = schedule_slot_targets.tenant_id));

DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.schedule_menu;
CREATE POLICY "Parent same tenant on insert" ON public.schedule_menu
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.schedules p
            WHERE p.id = schedule_menu.schedule_id AND p.tenant_id = schedule_menu.tenant_id)
    AND EXISTS (SELECT 1 FROM public.catalogs p
                WHERE p.id = schedule_menu.catalog_id AND p.tenant_id = schedule_menu.tenant_id)
  );
DROP POLICY IF EXISTS "Parent same tenant on update" ON public.schedule_menu;
CREATE POLICY "Parent same tenant on update" ON public.schedule_menu
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.schedules p
            WHERE p.id = schedule_menu.schedule_id AND p.tenant_id = schedule_menu.tenant_id)
    AND EXISTS (SELECT 1 FROM public.catalogs p
                WHERE p.id = schedule_menu.catalog_id AND p.tenant_id = schedule_menu.tenant_id)
  );

DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.schedule_style;
CREATE POLICY "Parent same tenant on insert" ON public.schedule_style
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.schedules p
            WHERE p.id = schedule_style.schedule_id AND p.tenant_id = schedule_style.tenant_id)
    AND EXISTS (SELECT 1 FROM public.styles p
                WHERE p.id = schedule_style.style_id AND p.tenant_id = schedule_style.tenant_id)
  );
DROP POLICY IF EXISTS "Parent same tenant on update" ON public.schedule_style;
CREATE POLICY "Parent same tenant on update" ON public.schedule_style
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.schedules p
            WHERE p.id = schedule_style.schedule_id AND p.tenant_id = schedule_style.tenant_id)
    AND EXISTS (SELECT 1 FROM public.styles p
                WHERE p.id = schedule_style.style_id AND p.tenant_id = schedule_style.tenant_id)
  );

-- Le tabelle nuove non servono ad anon: la pagina pubblica legge dalle edge
-- con service_role (20260409100000 ha tolto le letture anon delle figlie).
REVOKE ALL ON public.schedule_slots, public.schedule_slot_targets,
              public.schedule_menu, public.schedule_style FROM anon;
