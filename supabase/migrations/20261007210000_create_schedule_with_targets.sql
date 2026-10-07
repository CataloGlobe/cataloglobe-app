-- =============================================================================
-- Programmazione: un ruolo di sede crea una regola già sulle sue sedi.
-- =============================================================================
--
-- Problema: un manager non può creare regole. L'INSERT su schedules passa
-- (has_permission_any_activity), ma la regola nasce senza sedi: la SELECT
-- del RETURNING la rifiuta (can_read_schedule), update_schedule_targets la
-- rifiuta (blocco 2b, 20261007170200: una regola senza sedi non è sua) e
-- apply_to_all gli è vietato (20261007170100). In T9b «Nuova regola» e
-- «Duplica» sono nascosti ai ruoli di sede in attesa di questa funzione.
--
-- Soluzione: una RPC che crea la regola e le sue sedi nella stessa
-- transazione. Stessi controlli di update_schedule_targets sui target
-- (forma, esistenza nel tenant; per i ruoli di sede tutte le sedi sue come
-- manager, tutti i membri di ogni gruppo suoi), mai apply_to_all. La regola
-- nasce spenta (enabled = false), come la bozza dell'owner (createRuleDraft):
-- priorità media, display_order 0, sempre attiva (visibility_mode resta il
-- default della colonna, 'hide', come imposta createRuleDraft).
--
-- Owner/admin possono usarla allo stesso modo; il loro flusso attuale
-- (INSERT, poi apply_to_all = true) resta invariato.
--
-- SECURITY DEFINER: le scritture saltano l'RLS, quindi ogni controllo sta
-- qui, prima della prima scrittura. Idempotente (CREATE OR REPLACE).
-- =============================================================================

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
  IF p_rule_type IS NULL OR p_rule_type NOT IN ('layout', 'price', 'visibility', 'featured') THEN
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

COMMENT ON FUNCTION public.create_schedule_with_targets(uuid, text, text, jsonb) IS
  'Crea una regola spenta con le sue sedi in una transazione. Per i ruoli di sede: solo sedi gestite come manager e gruppi interamente suoi; mai apply_to_all.';

REVOKE EXECUTE ON FUNCTION public.create_schedule_with_targets(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_schedule_with_targets(uuid, text, text, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_schedule_with_targets(uuid, text, text, jsonb) TO authenticated;
