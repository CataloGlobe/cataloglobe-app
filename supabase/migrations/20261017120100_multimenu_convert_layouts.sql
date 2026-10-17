-- =============================================================================
-- Multi menù: ogni regola `layout` diventa una `menu` più una `style`
-- =============================================================================
-- Deciso da Lorenzo il 2026-10-17 (D116): la conversione si fa adesso.
--
-- Per ogni `layout` con la sua riga in `schedule_layout`:
-- - con un menù: la regola resta con lo stesso id e diventa `menu`
--   (`schedule_menu`, overlap `replace`); nasce una gemella `style` con id
--   nuovo, stesse sedi, fasce, periodo, nome e stato, overlap `replace`;
-- - senza menù (oggi non vince mai, D83): diventa `style` e si spegne, perché
--   accesa metterebbe in pagina uno stile che oggi non si vede.
-- Le `layout` senza riga in `schedule_layout` (bozze) restano come sono.
--
-- Ordine. Oggi fra le `layout` di una sede vince la prima per
-- `compareLayoutToday` (sede > gruppo > tutte, poi periodo/ore/giorni, poi
-- `priority`, poi la più vecchia, poi `id`); fra `menu` e `style` «replace»
-- vince la più nuova per `on_air_since`. Si riscrive `on_air_since` con un
-- ordine topologico del «chi batte chi» in ogni sede: se A batte B in una
-- sede, A è più nuova. Contano solo le regole che oggi possono vincere (accese,
-- non scadute, non «dal X senza fine»): le altre il giudice non le fa mai vincere e, nel grafo,
-- creerebbero cicli che oggi non ci sono. Le date restano quelle dell'azienda,
-- ridistribuite (meno 1 ms dove servono distinte).
--
-- Si ferma (e non cambia niente):
-- - se un ciclo (A batte B in una sede, B batte A in un'altra) rende l'ordine di
--   oggi non riproducibile: le regole si dicono in NOTICE, va visto a mano (D121);
-- - se un'azienda con regole `layout` da convertire ha già regole `menu` o
--   `style`: l'ordine con quelle va visto a mano.
-- Prima del rilascio in produzione si prova in una transazione annullata
-- (supabase/tests/multimenu_convert_layouts.test.sql). Il trigger delle fasce si salta
-- (`cataloglobe.schedule_bridge`) e le fasce si copiano così come sono.
-- Archivio in public.schedule_multimenu_conversion (20261017120000).
-- Rollback: per ogni riga dell'archivio, rimettere la riga di `schedule_layout`
-- (layout_row_id, catalog_id, style_id), `rule_type = 'layout'`,
-- `overlap_mode = NULL` (le `layout` non lo usano), `on_air_since_before`,
-- `enabled_before`; cancellare la gemella (style_rule_id) e le righe di
-- `schedule_menu`/`schedule_style`. Vale finché nessuno ha modificato le regole
-- convertite: dopo, quelle modifiche si perdono.
--
-- Ordine del rilascio: questa migration cancella le righe `schedule_layout`
-- convertite, quindi va dopo il front e le edge che leggono `menu`/`style`.
-- =============================================================================

DO $$
DECLARE
  v_tenant uuid;
  v_pick   uuid;
  v_free   boolean;
  v_rank   integer;
  v_prev   timestamptz;
  v_twin   uuid;
  r        record;
BEGIN
  PERFORM set_config('cataloglobe.schedule_bridge', 'from_slots', true);

  IF EXISTS (
    SELECT 1 FROM public.schedules m
    WHERE m.rule_type IN ('menu', 'style')
      AND m.tenant_id IN (SELECT s.tenant_id FROM public.schedules s
                          JOIN public.schedule_layout sl ON sl.schedule_id = s.id
                          WHERE s.rule_type = 'layout')
  ) THEN
    RAISE EXCEPTION 'Multi menù: aziende con regole layout e già regole menu/style, da vedere a mano';
  END IF;

  CREATE TEMP TABLE mm_rule ON COMMIT DROP AS
  SELECT s.id, s.tenant_id, s.name, s.apply_to_all, s.priority, s.created_at, s.on_air_since, s.enabled,
         sl.id AS layout_row_id, sl.created_at AS layout_row_created_at, sl.catalog_id, sl.style_id,
         (CASE WHEN s.start_at IS NOT NULL OR s.end_at IS NOT NULL THEN 4 ELSE 0 END
          + CASE WHEN s.time_from IS NOT NULL AND s.time_to IS NOT NULL THEN 2 ELSE 0 END
          + CASE WHEN coalesce(cardinality(s.days_of_week), 0) > 0 THEN 1 ELSE 0 END) AS score,
         -- come isTimeRuleActiveNow: spenta, scaduta o «dal X senza fine» non vince mai
         s.enabled AND (s.end_at IS NULL OR s.end_at > now())
           AND NOT (s.time_mode = 'window' AND s.start_at IS NOT NULL AND s.end_at IS NULL) AS live,
         NULL::integer AS rank, false AS in_cycle, NULL::timestamptz AS new_on_air
  FROM public.schedules s
  JOIN public.schedule_layout sl ON sl.schedule_id = s.id
  WHERE s.rule_type = 'layout';

  -- Specificità di ogni regola in ogni sede che raggiunge (specificityFor).
  CREATE TEMP TABLE mm_spec ON COMMIT DROP AS
  SELECT x.rule_id, x.activity_id, x.spec FROM (
    SELECT mr.id AS rule_id, a.id AS activity_id,
           CASE
             WHEN mr.apply_to_all THEN 0
             WHEN EXISTS (SELECT 1 FROM public.schedule_targets t
                          WHERE t.schedule_id = mr.id AND t.target_type = 'activity' AND t.target_id = a.id) THEN 2
             WHEN EXISTS (SELECT 1 FROM public.schedule_targets t
                          JOIN public.activity_group_members g ON g.group_id = t.target_id
                          WHERE t.schedule_id = mr.id AND t.target_type = 'activity_group' AND g.activity_id = a.id) THEN 1
           END AS spec
    FROM mm_rule mr
    JOIN public.activities a ON a.tenant_id = mr.tenant_id
  ) x WHERE x.spec IS NOT NULL;

  -- «winner batte loser» in almeno una sede (compareLayoutToday), fra regole con menù che oggi possono vincere.
  CREATE TEMP TABLE mm_edge ON COMMIT DROP AS
  SELECT DISTINCT w.id AS winner, l.id AS loser
  FROM mm_rule w
  JOIN mm_rule l ON l.tenant_id = w.tenant_id AND l.id <> w.id
  JOIN mm_spec sw ON sw.rule_id = w.id
  JOIN mm_spec sl ON sl.rule_id = l.id AND sl.activity_id = sw.activity_id
  WHERE w.catalog_id IS NOT NULL AND l.catalog_id IS NOT NULL AND w.live AND l.live
    AND (-sw.spec, -w.score, w.priority, w.created_at, w.id) < (-sl.spec, -l.score, l.priority, l.created_at, l.id);

  -- Ordine topologico per azienda: prima chi non è battuto da nessuna rimasta.
  FOR v_tenant IN SELECT DISTINCT tenant_id FROM mm_rule LOOP
    v_rank := 0;
    LOOP
      v_pick := NULL;
      SELECT q.id, q.free INTO v_pick, v_free FROM (
        SELECT mr.id, mr.catalog_id, mr.score, mr.priority, mr.created_at,
               NOT EXISTS (SELECT 1 FROM mm_edge e JOIN mm_rule w ON w.id = e.winner
                           WHERE e.loser = mr.id AND w.rank IS NULL) AS free
        FROM mm_rule mr
        WHERE mr.tenant_id = v_tenant AND mr.rank IS NULL
      ) q
      ORDER BY (q.catalog_id IS NULL), q.free DESC, q.score DESC, q.priority, q.created_at, q.id
      LIMIT 1;
      EXIT WHEN v_pick IS NULL;
      v_rank := v_rank + 1;
      UPDATE mm_rule SET rank = v_rank, in_cycle = NOT v_free WHERE id = v_pick;
    END LOOP;
  END LOOP;

  -- Le date dell'azienda, dalla più nuova, nell'ordine trovato; distinte.
  UPDATE mm_rule mr SET new_on_air = d.on_air_since
  FROM (SELECT tenant_id, on_air_since,
               row_number() OVER (PARTITION BY tenant_id ORDER BY on_air_since DESC, id) AS k
        FROM mm_rule) d
  WHERE d.tenant_id = mr.tenant_id AND d.k = mr.rank;

  v_tenant := NULL;
  FOR r IN SELECT id, tenant_id, new_on_air FROM mm_rule ORDER BY tenant_id, rank LOOP
    IF r.tenant_id IS DISTINCT FROM v_tenant THEN
      v_tenant := r.tenant_id;
    ELSIF r.new_on_air >= v_prev THEN
      UPDATE mm_rule SET new_on_air = v_prev - interval '1 millisecond' WHERE id = r.id;
      r.new_on_air := v_prev - interval '1 millisecond';
    END IF;
    v_prev := r.new_on_air;
  END LOOP;

  FOR r IN SELECT * FROM mm_rule WHERE in_cycle ORDER BY tenant_id, rank LOOP
    RAISE NOTICE 'Multi menù: ordine non riproducibile in tutte le sedi, azienda %, regola % (%)', r.tenant_id, r.id, r.name;
  END LOOP;
  IF EXISTS (SELECT 1 FROM mm_rule WHERE in_cycle) THEN
    RAISE EXCEPTION 'Multi menù: ordine di oggi non riproducibile (regole nei NOTICE), da vedere a mano';
  END IF;

  FOR r IN SELECT * FROM mm_rule ORDER BY tenant_id, rank LOOP
    IF r.catalog_id IS NOT NULL THEN
      v_twin := gen_random_uuid();
      INSERT INTO public.schedules (
        id, tenant_id, rule_type, target_type, target_id, priority, enabled, is_baseline, time_mode,
        days_of_week, time_from, time_to, start_at, end_at, created_at, updated_at, apply_to_all,
        visibility_mode, name, priority_level, display_order, overlap_mode, on_air_since)
      SELECT v_twin, s.tenant_id, 'style', s.target_type, s.target_id, s.priority, s.enabled, s.is_baseline, s.time_mode,
             s.days_of_week, s.time_from, s.time_to, s.start_at, s.end_at, s.created_at, now(), s.apply_to_all,
             s.visibility_mode, s.name, s.priority_level, s.display_order, 'replace', r.new_on_air
      FROM public.schedules s WHERE s.id = r.id;

      INSERT INTO public.schedule_style (tenant_id, schedule_id, style_id) VALUES (r.tenant_id, v_twin, r.style_id);
      INSERT INTO public.schedule_targets (schedule_id, target_type, target_id, overlap_mode)
      SELECT v_twin, t.target_type, t.target_id, t.overlap_mode FROM public.schedule_targets t WHERE t.schedule_id = r.id;
      INSERT INTO public.schedule_slots (tenant_id, schedule_id, days_of_week, start_minute, end_minute, sort_order)
      SELECT x.tenant_id, v_twin, x.days_of_week, x.start_minute, x.end_minute, x.sort_order
      FROM public.schedule_slots x WHERE x.schedule_id = r.id;

      INSERT INTO public.schedule_menu (tenant_id, schedule_id, catalog_id) VALUES (r.tenant_id, r.id, r.catalog_id);
      UPDATE public.schedules
      SET rule_type = 'menu', overlap_mode = 'replace', on_air_since = r.new_on_air, updated_at = now()
      WHERE id = r.id;
    ELSE
      v_twin := NULL;
      INSERT INTO public.schedule_style (tenant_id, schedule_id, style_id) VALUES (r.tenant_id, r.id, r.style_id);
      UPDATE public.schedules
      SET rule_type = 'style', overlap_mode = 'replace', on_air_since = r.new_on_air, enabled = false, updated_at = now()
      WHERE id = r.id;
    END IF;

    INSERT INTO public.schedule_multimenu_conversion (
      schedule_id, tenant_id, became, style_rule_id, catalog_id, style_id, layout_row_id, layout_row_created_at,
      enabled_before, on_air_since_before, on_air_since_after, rank_in_tenant, in_cycle)
    VALUES (
      r.id, r.tenant_id, CASE WHEN r.catalog_id IS NULL THEN 'style' ELSE 'menu' END, v_twin, r.catalog_id, r.style_id,
      r.layout_row_id, r.layout_row_created_at, r.enabled, r.on_air_since, r.new_on_air, r.rank, r.in_cycle);
  END LOOP;

  DELETE FROM public.schedule_layout sl USING mm_rule mr WHERE sl.id = mr.layout_row_id;
END $$;
