-- =============================================================================
-- Fase 3 RPC #3 — update_schedule_targets
--
-- Chiude il loop architetturale della policy RESTRICTIVE su
-- public.schedule_targets (migration 20260528210000 hardening_phase2).
-- Le RESTRICTIVE bloccano INSERT/UPDATE/DELETE diretti per `authenticated`.
-- Questa RPC è l'unico path di mutazione lato client.
--
-- Scope: TARGET-ONLY. Non tocca `schedules` (metadata restano scritte via
-- INSERT/UPDATE normale sulla tabella schedules).
--
-- Logica:
--   - Risolve schedule → tenant_id, apply_to_all
--   - Blocca apply_to_all=true (per design no target)
--   - Auth caller: owner|admin|manager + hardening has_permission_any_activity
--   - Valida p_targets jsonb array (cardinality >= 1, ogni elemento ben formato)
--   - Valida ogni target_id esiste e appartiene a schedule.tenant_id
--   - Manager scoped: activity target tutte sue, activity_group tutte le sue
--     activity contenute
--   - Mutazione atomica: DELETE-all + INSERT
--   - RETURN cardinality(p_targets) finale
--
-- Pattern caller frontend (Fase 5):
--   const { data: count, error } = await supabase.rpc('update_schedule_targets', {
--     p_schedule_id: scheduleId,
--     p_targets: [
--       { target_type: 'activity',       target_id: '<uuid>' },
--       { target_type: 'activity_group', target_id: '<uuid>' }
--     ]
--   });
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_schedule_targets(
  p_schedule_id uuid,
  p_targets     jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid                 uuid := auth.uid();
  v_tenant_id           uuid;
  v_apply_to_all        boolean;
  v_caller_is_owner     boolean;
  v_caller_is_admin     boolean;
  v_caller_scoped       boolean;
  v_count               integer;
  v_invalid_count       integer;
  v_invalid_type_count  integer;
  v_unauthorized_count  integer;
  v_group_unauthorized  integer;
BEGIN
  -- =========================================================================
  -- 0. Auth presence
  -- =========================================================================
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta'
      USING ERRCODE = '42501';
  END IF;

  -- =========================================================================
  -- 1. Resolve schedule
  -- =========================================================================
  SELECT s.tenant_id, s.apply_to_all
  INTO v_tenant_id, v_apply_to_all
  FROM public.schedules s
  WHERE s.id = p_schedule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programmazione non trovata'
      USING ERRCODE = '44000';
  END IF;

  IF v_apply_to_all THEN
    RAISE EXCEPTION 'Impossibile impostare target su una programmazione apply_to_all'
      USING ERRCODE = '22023';
  END IF;

  -- =========================================================================
  -- 2. Auth caller — scope detection + hardening
  -- =========================================================================
  v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = v_tenant_id
      AND owner_user_id = v_uid
      AND deleted_at IS NULL
  );

  v_caller_is_admin := EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = v_tenant_id
      AND user_id   = v_uid
      AND status    = 'active'
      AND role      = 'admin'
  );

  v_caller_scoped := NOT (v_caller_is_owner OR v_caller_is_admin);

  -- Hardening: copre sia owner/admin (via branch tenant in has_permission)
  -- sia manager activity-scoped (via branch activity con qualsiasi p_activity_id
  -- delle sue sedi sul tenant). Se in futuro si revoca scheduling.write a
  -- manager, la RPC torna 42501 senza modifiche.
  IF NOT public.has_permission_any_activity('scheduling.write', v_tenant_id) THEN
    RAISE EXCEPTION 'Permesso negato: il tuo ruolo non consente di modificare programmazioni'
      USING ERRCODE = '42501';
  END IF;

  -- =========================================================================
  -- 3. Validazione p_targets — forma e cardinalità
  -- =========================================================================
  IF p_targets IS NULL OR jsonb_typeof(p_targets) <> 'array' THEN
    RAISE EXCEPTION 'p_targets deve essere un array JSON'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count FROM jsonb_array_elements(p_targets);

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Devi specificare almeno un target. Per programmazioni senza target usa apply_to_all=true.'
      USING ERRCODE = '22023';
  END IF;

  -- Ogni elemento deve avere target_type IN (activity, activity_group) e
  -- target_id UUID valido (jsonb cast tollera, valida via uuid::text cast).
  SELECT count(*) INTO v_invalid_type_count
  FROM jsonb_array_elements(p_targets) AS t
  WHERE NOT (
    (t->>'target_type') IN ('activity', 'activity_group')
    AND (t->>'target_id') IS NOT NULL
    AND (t->>'target_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

  IF v_invalid_type_count > 0 THEN
    RAISE EXCEPTION 'Ogni target deve avere target_type valido (activity|activity_group) e target_id UUID'
      USING ERRCODE = '22023';
  END IF;

  -- Materializza dedup (target_type, target_id) in temp via CTE poi reuso
  -- nelle validation seguenti.
  WITH parsed AS (
    SELECT DISTINCT
      (t->>'target_type') AS target_type,
      (t->>'target_id')::uuid AS target_id
    FROM jsonb_array_elements(p_targets) AS t
  )
  SELECT count(*) INTO v_count FROM parsed;

  -- =========================================================================
  -- 4. Validazione target_id esistenza + tenant scope
  -- =========================================================================
  -- 'activity' target deve esistere e tenant_id = v_tenant_id
  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT DISTINCT (t->>'target_id')::uuid AS target_id
    FROM jsonb_array_elements(p_targets) AS t
    WHERE (t->>'target_type') = 'activity'
  ) a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.activities act
    WHERE act.id = a.target_id
      AND act.tenant_id = v_tenant_id
  );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Una o più sedi target non sono valide o non appartengono a questa azienda'
      USING ERRCODE = '22023';
  END IF;

  -- 'activity_group' target deve esistere e tenant_id = v_tenant_id
  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT DISTINCT (t->>'target_id')::uuid AS target_id
    FROM jsonb_array_elements(p_targets) AS t
    WHERE (t->>'target_type') = 'activity_group'
  ) g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.activity_groups ag
    WHERE ag.id = g.target_id
      AND ag.tenant_id = v_tenant_id
  );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Uno o più gruppi target non sono validi o non appartengono a questa azienda'
      USING ERRCODE = '22023';
  END IF;

  -- =========================================================================
  -- 5. Manager scoped — check sedi
  -- =========================================================================
  IF v_caller_scoped THEN
    -- Activity target devono essere tutte tra le sue sedi
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
        AND tm.tenant_id = v_tenant_id
        AND tma.role     = 'manager'
    );

    IF v_unauthorized_count > 0 THEN
      RAISE EXCEPTION 'Permesso negato: puoi assegnare solo le sedi che gestisci come manager'
        USING ERRCODE = '42501';
    END IF;

    -- Activity_group target: TUTTE le activity del gruppo devono essere
    -- nelle sue sedi. Se anche una sola fuori scope → blocco.
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
            AND tm.tenant_id = v_tenant_id
            AND tma.role     = 'manager'
        )
    );

    IF v_group_unauthorized > 0 THEN
      RAISE EXCEPTION 'Permesso negato: uno o più gruppi target contengono sedi fuori dal tuo scope'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- =========================================================================
  -- 6. Mutazione atomica
  -- =========================================================================
  DELETE FROM public.schedule_targets
  WHERE schedule_id = p_schedule_id;

  INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
  SELECT DISTINCT
    p_schedule_id,
    (t->>'target_type'),
    (t->>'target_id')::uuid
  FROM jsonb_array_elements(p_targets) AS t;

  -- =========================================================================
  -- 7. RETURN count finale
  -- =========================================================================
  SELECT count(*) INTO v_count
  FROM public.schedule_targets
  WHERE schedule_id = p_schedule_id;

  RETURN v_count;
END;
$function$;

-- =============================================================================
-- Lockdown grants
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.update_schedule_targets(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_schedule_targets(uuid, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_schedule_targets(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_schedule_targets(uuid, jsonb) IS
'Sostituisce atomicamente i target di uno schedule. Unico path di mutazione '
'lato client per schedule_targets (RESTRICTIVE policy blocca INSERT/UPDATE/DELETE diretti). '
'Owner/admin: qualsiasi target del tenant. Manager: solo activity nello scope e '
'activity_group con tutte le activity nello scope. Blocca schedules apply_to_all=true.';
