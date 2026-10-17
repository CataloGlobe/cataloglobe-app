-- =============================================================================
-- Multi menù, passo 3: salvataggio del modello nuovo in un colpo solo.
--
-- 1. save_schedule_model(p_schedule_id, p_payload): su una regola `menu` o
--    `style` già creata (create_schedule_with_targets o insert diretto) scrive
--    in una transazione:
--      - il menù (`schedule_menu`) o lo stile (`schedule_style`);
--      - `overlap_mode` della regola e, per sede o gruppo, di `schedule_targets`;
--      - le fasce (`schedule_slots`, più d'una, anche oltre mezzanotte) e le
--        sedi di ogni fascia (`schedule_slot_targets`, «ore per sede»).
--    Il ponte gira al contrario: con `cataloglobe.schedule_bridge = 'from_slots'`
--    (locale alla transazione) il trigger `schedule_slots_from_legacy` non
--    tocca le fasce, e la RPC riscrive le colonne di oggi dalla prima fascia,
--    così il codice di prima legge ancora una regola sensata e si può tornare
--    indietro. Con più fasce, o una fascia oltre mezzanotte, le colonne di oggi
--    dicono solo la prima (oltre mezzanotte: fine non dopo l'inizio, cioè
--    «mai» per il giudice vecchio): è la perdita voluta del ritorno indietro.
--    Nome, stato, periodo e sedi restano alle scritture di oggi (updateRule,
--    update_schedule_targets).
-- 2. create_schedule_with_targets accetta anche `menu` e `style`, per le bozze
--    dei ruoli di sede.
--
-- Payload (jsonb, chiavi facoltative salvo dove detto):
--   {
--     "catalog_id":   uuid       -- regola menu: obbligatorio
--     "style_id":     uuid       -- regola style: obbligatorio
--     "overlap_mode": text|null  -- menu: together|replace; style: replace|keep
--     "target_overlaps": [ { "target_type", "target_id", "overlap_mode" } ]
--     "slots": [ { "days_of_week": int[]|null, "start_minute": int,
--                  "end_minute": int,
--                  "targets": [ { "target_type", "target_id" } ] } ]
--   }
-- `slots` assente: fasce non toccate; `[]`: «Sempre». Le sedi di una fascia
-- devono essere sedi o gruppi della regola; nessuna sede = tutte quelle della
-- regola.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_schedule_model(
  p_schedule_id uuid,
  p_payload     jsonb
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_rule       record;
  v_mode       text;
  v_slot       jsonb;
  v_target     jsonb;
  v_slot_id    uuid;
  v_target_id  uuid;
  v_index      integer := 0;
  v_first      jsonb;
  v_end        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, rule_type INTO v_rule
  FROM public.schedules
  WHERE id = p_schedule_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Regola non trovata' USING ERRCODE = '44000';
  END IF;
  IF NOT public.has_permission_any_activity('scheduling.write', v_rule.tenant_id)
     OR NOT public.can_write_schedule(p_schedule_id) THEN
    RAISE EXCEPTION 'Permesso negato: non puoi modificare questa regola' USING ERRCODE = '42501';
  END IF;
  IF v_rule.rule_type NOT IN ('menu', 'style') THEN
    RAISE EXCEPTION 'Solo le regole di menù e di stile si salvano così' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload deve essere un oggetto JSON' USING ERRCODE = '22023';
  END IF;

  -- Menù o stile.
  IF v_rule.rule_type = 'menu' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.catalogs c
      WHERE c.id = (p_payload->>'catalog_id')::uuid AND c.tenant_id = v_rule.tenant_id
    ) THEN
      RAISE EXCEPTION 'Menù non valido o di un''altra azienda' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.schedule_menu (tenant_id, schedule_id, catalog_id)
    VALUES (v_rule.tenant_id, p_schedule_id, (p_payload->>'catalog_id')::uuid)
    ON CONFLICT (schedule_id) DO UPDATE SET catalog_id = EXCLUDED.catalog_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.styles s
      WHERE s.id = (p_payload->>'style_id')::uuid AND s.tenant_id = v_rule.tenant_id
    ) THEN
      RAISE EXCEPTION 'Stile non valido o di un''altra azienda' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.schedule_style (tenant_id, schedule_id, style_id)
    VALUES (v_rule.tenant_id, p_schedule_id, (p_payload->>'style_id')::uuid)
    ON CONFLICT (schedule_id) DO UPDATE SET style_id = EXCLUDED.style_id;
  END IF;

  -- Come si comporta con le altre: il check della tabella lega il valore al tipo.
  IF p_payload ? 'overlap_mode' THEN
    UPDATE public.schedules
    SET overlap_mode = p_payload->>'overlap_mode'
    WHERE id = p_schedule_id;
  END IF;

  IF p_payload ? 'target_overlaps' THEN
    IF jsonb_typeof(p_payload->'target_overlaps') <> 'array' THEN
      RAISE EXCEPTION 'target_overlaps deve essere un array' USING ERRCODE = '22023';
    END IF;
    UPDATE public.schedule_targets SET overlap_mode = NULL WHERE schedule_id = p_schedule_id;
    FOR v_target IN SELECT * FROM jsonb_array_elements(p_payload->'target_overlaps') LOOP
      v_mode := v_target->>'overlap_mode';
      UPDATE public.schedule_targets
      SET overlap_mode = v_mode
      WHERE schedule_id = p_schedule_id
        AND target_type = v_target->>'target_type'
        AND target_id = (v_target->>'target_id')::uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'La sede o il gruppo % non è della regola', v_target->>'target_id' USING ERRCODE = '22023';
      END IF;
      IF v_mode IS NOT NULL AND (
        (v_rule.rule_type = 'menu' AND v_mode NOT IN ('together', 'replace'))
        OR (v_rule.rule_type = 'style' AND v_mode NOT IN ('replace', 'keep'))
      ) THEN
        RAISE EXCEPTION 'Modo % non valido per una regola %', v_mode, v_rule.rule_type USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  -- Le fasce: si riscrivono tutte, il ponte resta fermo.
  IF p_payload ? 'slots' THEN
    IF jsonb_typeof(p_payload->'slots') <> 'array' THEN
      RAISE EXCEPTION 'slots deve essere un array' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_payload->'slots') > 20 THEN
      RAISE EXCEPTION 'Al massimo 20 fasce per regola' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('cataloglobe.schedule_bridge', 'from_slots', true);

    DELETE FROM public.schedule_slots WHERE schedule_id = p_schedule_id;
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_payload->'slots') LOOP
      -- I check della tabella dicono minuti, giorni e lunghezza (al più 24 ore).
      INSERT INTO public.schedule_slots
        (tenant_id, schedule_id, days_of_week, start_minute, end_minute, sort_order)
      VALUES (
        v_rule.tenant_id,
        p_schedule_id,
        CASE WHEN v_slot->'days_of_week' IS NULL OR jsonb_typeof(v_slot->'days_of_week') = 'null' THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(v_slot->'days_of_week')::integer) END,
        (v_slot->>'start_minute')::integer,
        (v_slot->>'end_minute')::integer,
        v_index
      )
      RETURNING id INTO v_slot_id;

      FOR v_target IN SELECT * FROM jsonb_array_elements(coalesce(v_slot->'targets', '[]'::jsonb)) LOOP
        SELECT id INTO v_target_id
        FROM public.schedule_targets
        WHERE schedule_id = p_schedule_id
          AND target_type = v_target->>'target_type'
          AND target_id = (v_target->>'target_id')::uuid;
        IF v_target_id IS NULL THEN
          RAISE EXCEPTION 'La sede o il gruppo % della fascia non è della regola', v_target->>'target_id'
            USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.schedule_slot_targets (tenant_id, schedule_id, slot_id, schedule_target_id)
        VALUES (v_rule.tenant_id, p_schedule_id, v_slot_id, v_target_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
      v_index := v_index + 1;
    END LOOP;

    -- Le colonne di oggi dalla prima fascia (vedi testata).
    v_first := p_payload->'slots'->0;
    IF v_first IS NULL THEN
      UPDATE public.schedules
      SET time_mode = 'always', days_of_week = NULL, time_from = NULL, time_to = NULL
      WHERE id = p_schedule_id;
    ELSE
      v_end := (v_first->>'end_minute')::integer;
      UPDATE public.schedules
      SET time_mode = 'window',
          days_of_week = (SELECT s.days_of_week FROM public.schedule_slots s
                          WHERE s.schedule_id = p_schedule_id AND s.sort_order = 0),
          time_from = make_time((v_first->>'start_minute')::integer / 60, (v_first->>'start_minute')::integer % 60, 0),
          time_to = CASE
            WHEN v_end = 1440 THEN time '23:59'
            ELSE make_time((v_end % 1440) / 60, (v_end % 1440) % 60, 0)
          END
      WHERE id = p_schedule_id;
    END IF;
  END IF;
END;
$function$;

-- 2. create_schedule_with_targets: identica a 20261007210000 salvo i tipi ammessi.
CREATE OR REPLACE FUNCTION public.create_schedule_with_targets(
  p_tenant_id uuid,
  p_rule_type text,
  p_name      text,
  p_targets   jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid                 uuid := auth.uid();
  v_caller_is_owner     boolean;
  v_caller_is_admin     boolean;
  v_caller_scoped       boolean;
  v_count               integer;
  v_invalid_count       integer;
  v_unauthorized_count  integer;
  v_group_unauthorized  integer;
  v_name                text := nullif(btrim(coalesce(p_name, '')), '');
  v_schedule_id         uuid;
BEGIN
  -- 0. Auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta'
      USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Azienda non trovata'
      USING ERRCODE = '44000';
  END IF;

  -- 1. Permesso: scheduling.write sull'azienda o su almeno una sede
  IF NOT public.has_permission_any_activity('scheduling.write', p_tenant_id) THEN
    RAISE EXCEPTION 'Permesso negato: il tuo ruolo non consente di creare programmazioni'
      USING ERRCODE = '42501';
  END IF;

  v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id
      AND owner_user_id = v_uid
      AND deleted_at IS NULL
  );

  v_caller_is_admin := EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id   = v_uid
      AND status    = 'active'
      AND role      = 'admin'
  );

  v_caller_scoped := NOT (v_caller_is_owner OR v_caller_is_admin);

  -- 2. Tipo di regola
  IF p_rule_type IS NULL OR p_rule_type NOT IN ('layout', 'menu', 'style', 'price', 'visibility', 'featured') THEN
    RAISE EXCEPTION 'Tipo di regola non valido'
      USING ERRCODE = '22023';
  END IF;

  -- 3. p_targets: forma e cardinalità (come update_schedule_targets)
  IF p_targets IS NULL OR jsonb_typeof(p_targets) <> 'array' THEN
    RAISE EXCEPTION 'p_targets deve essere un array JSON'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count FROM jsonb_array_elements(p_targets);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Devi specificare almeno una sede o un gruppo'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM jsonb_array_elements(p_targets) AS t
  WHERE NOT (
    jsonb_typeof(t) = 'object'
    AND (t->>'target_type') IN ('activity', 'activity_group')
    AND (t->>'target_id') IS NOT NULL
    AND (t->>'target_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Ogni target deve avere target_type valido (activity|activity_group) e target_id UUID'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Target esistenti e dell'azienda
  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT DISTINCT (t->>'target_id')::uuid AS target_id
    FROM jsonb_array_elements(p_targets) AS t
    WHERE (t->>'target_type') = 'activity'
  ) a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.activities act
    WHERE act.id = a.target_id
      AND act.tenant_id = p_tenant_id
  );
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Una o più sedi target non sono valide o non appartengono a questa azienda'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT DISTINCT (t->>'target_id')::uuid AS target_id
    FROM jsonb_array_elements(p_targets) AS t
    WHERE (t->>'target_type') = 'activity_group'
  ) g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.activity_groups ag
    WHERE ag.id = g.target_id
      AND ag.tenant_id = p_tenant_id
  );
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Uno o più gruppi target non sono validi o non appartengono a questa azienda'
      USING ERRCODE = '22023';
  END IF;

  -- 5. Ruoli di sede: solo sedi che gestisce come manager; un gruppo solo
  --    se tutte le sue sedi sono sue (un gruppo vuoto non dà sedi: passa,
  --    come in update_schedule_targets).
  IF v_caller_scoped THEN
    SELECT count(*) INTO v_unauthorized_count
    FROM (
      SELECT DISTINCT (t->>'target_id')::uuid AS target_id
      FROM jsonb_array_elements(p_targets) AS t
      WHERE (t->>'target_type') = 'activity'
    ) a
    WHERE a.target_id NOT IN (
      SELECT tma.activity_id
      FROM public.tenant_membership_activities tma
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      WHERE tm.user_id   = v_uid
        AND tm.status    = 'active'
        AND tm.tenant_id = p_tenant_id
        AND tma.role     = 'manager'
    );
    IF v_unauthorized_count > 0 THEN
      RAISE EXCEPTION 'Permesso negato: puoi assegnare solo le sedi che gestisci come manager'
        USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_group_unauthorized
    FROM (
      SELECT DISTINCT (t->>'target_id')::uuid AS group_id
      FROM jsonb_array_elements(p_targets) AS t
      WHERE (t->>'target_type') = 'activity_group'
    ) g
    WHERE EXISTS (
      SELECT 1
      FROM public.activity_group_members agm
      WHERE agm.group_id = g.group_id
        AND agm.activity_id NOT IN (
          SELECT tma.activity_id
          FROM public.tenant_membership_activities tma
          JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
          WHERE tm.user_id   = v_uid
            AND tm.status    = 'active'
            AND tm.tenant_id = p_tenant_id
            AND tma.role     = 'manager'
        )
    );
    IF v_group_unauthorized > 0 THEN
      RAISE EXCEPTION 'Permesso negato: uno o più gruppi target contengono sedi fuori dal tuo scope'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 6. Regola e sedi insieme
  INSERT INTO public.schedules (
    tenant_id, rule_type, name, target_type, target_id, apply_to_all,
    priority, priority_level, display_order, enabled, time_mode,
    days_of_week, time_from, time_to
  )
  VALUES (
    p_tenant_id, p_rule_type, v_name, NULL, NULL, false,
    21, 'medium', 0, false, 'always',
    NULL, NULL, NULL
  )
  RETURNING id INTO v_schedule_id;

  INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
  SELECT DISTINCT
    v_schedule_id,
    (t->>'target_type'),
    (t->>'target_id')::uuid
  FROM jsonb_array_elements(p_targets) AS t;

  RETURN v_schedule_id;
END;
$function$;
