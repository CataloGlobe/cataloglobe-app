-- =============================================================================
-- Fase 5.B.3 — remove_tenant_member rewrite (v2)
--
-- Sostituisce la vecchia firma (p_tenant_id, p_user_id) con (p_membership_id)
-- per supportare il modello permessi multi-sede a 5 ruoli e manager scope.
--
-- Cambio firma:
--   OLD: (p_tenant_id uuid, p_user_id uuid) RETURNS void
--          - check tm.role IN ('owner','admin') (BROKEN post-Fase 5.B.2 cleanup
--            owner rows)
--          - no manager support
--          - no tma cleanup
--   NEW: (p_membership_id uuid) RETURNS void
--          - triple owner check (owner via tenants, admin via tm, manager via tma)
--          - has_permission('team.remove', NULL) hardening
--          - manager: target_user_id deve avere almeno una sede in comune con
--            le activity_ids del caller manager
--          - DELETE tma rows + UPDATE tm.status='left'
--          - self-removal blocked (42501)
--          - owner target blocked (42501, defense in depth)
--
-- Soft-delete via status='left' preservato per backward compat con leave_tenant.
-- =============================================================================

-- DROP vecchia firma (cambio args richiede DROP esplicito)
DROP FUNCTION IF EXISTS public.remove_tenant_member(uuid, uuid);

CREATE OR REPLACE FUNCTION public.remove_tenant_member(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid                 uuid := auth.uid();
  v_target_tenant_id    uuid;
  v_target_user_id      uuid;
  v_target_status       text;
  v_target_role         text;
  v_target_is_admin     boolean;
  v_caller_is_owner     boolean;
  v_caller_is_admin     boolean;
  v_caller_is_manager   boolean;
  v_caller_scoped       boolean;
  v_target_unauthorized integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta'
      USING ERRCODE = '42501';
  END IF;

  -- Resolve target membership
  SELECT tm.tenant_id, tm.user_id, tm.status, tm.role
  INTO v_target_tenant_id, v_target_user_id, v_target_status, v_target_role
  FROM public.tenant_memberships tm
  WHERE tm.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership non trovata'
      USING ERRCODE = '44000';
  END IF;

  -- Self-removal blocked
  IF v_target_user_id = v_uid THEN
    RAISE EXCEPTION 'Non puoi rimuovere te stesso. Usa "Esci dall''azienda" invece.'
      USING ERRCODE = '42501';
  END IF;

  -- Owner target blocked (defense in depth: owner non dovrebbe avere tm
  -- post-Fase 5.B.2 cleanup, ma check difensivo per robustezza)
  IF EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = v_target_tenant_id
      AND owner_user_id = v_target_user_id
  ) THEN
    RAISE EXCEPTION 'Impossibile rimuovere il proprietario.'
      USING ERRCODE = '42501';
  END IF;

  -- Status guard
  IF v_target_status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'Impossibile rimuovere una membership in stato %', v_target_status
      USING ERRCODE = '22023';
  END IF;

  v_target_is_admin := (v_target_role = 'admin');

  -- Auth caller
  v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = v_target_tenant_id
      AND owner_user_id = v_uid
      AND deleted_at IS NULL
  );

  v_caller_is_admin := EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = v_target_tenant_id
      AND user_id   = v_uid
      AND status    = 'active'
      AND role      = 'admin'
  );

  v_caller_is_manager := EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenant_membership_activities tma ON tma.tenant_membership_id = tm.id
    WHERE tm.tenant_id = v_target_tenant_id
      AND tm.user_id   = v_uid
      AND tm.status    = 'active'
      AND tma.role     = 'manager'
  );

  IF NOT (v_caller_is_owner OR v_caller_is_admin OR v_caller_is_manager) THEN
    RAISE EXCEPTION 'Permesso negato: non puoi rimuovere membri in questa azienda'
      USING ERRCODE = '42501';
  END IF;

  -- Hardening: grant tabellare team.remove
  IF NOT public.has_permission('team.remove', NULL) THEN
    RAISE EXCEPTION 'Permesso negato: il tuo ruolo non consente di rimuovere membri'
      USING ERRCODE = '42501';
  END IF;

  v_caller_scoped := NOT (v_caller_is_owner OR v_caller_is_admin);

  -- Manager constraints
  IF v_caller_scoped THEN
    -- Manager non può rimuovere admin
    IF v_target_is_admin THEN
      RAISE EXCEPTION 'Permesso negato: solo owner e admin possono rimuovere un admin'
        USING ERRCODE = '42501';
    END IF;

    -- Manager può rimuovere solo membership con TUTTE le tma nelle sue sedi
    SELECT count(*) INTO v_target_unauthorized
    FROM public.tenant_membership_activities tma
    WHERE tma.tenant_membership_id = p_membership_id
      AND tma.activity_id NOT IN (
        SELECT tma2.activity_id
        FROM public.tenant_membership_activities tma2
        JOIN public.tenant_memberships tm2 ON tm2.id = tma2.tenant_membership_id
        WHERE tm2.user_id   = v_uid
          AND tm2.status    = 'active'
          AND tm2.tenant_id = v_target_tenant_id
          AND tma2.role     = 'manager'
      );

    IF v_target_unauthorized > 0 THEN
      RAISE EXCEPTION 'Permesso negato: puoi rimuovere solo membri assegnati alle sedi che gestisci'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Mutazione atomica: DELETE tma rows + UPDATE tm soft-delete
  DELETE FROM public.tenant_membership_activities
  WHERE tenant_membership_id = p_membership_id;

  UPDATE public.tenant_memberships
  SET status        = 'left',
      invited_email = NULL,
      updated_at    = now()
  WHERE id = p_membership_id;
END;
$function$;

-- Lockdown grants
REVOKE EXECUTE ON FUNCTION public.remove_tenant_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_tenant_member(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.remove_tenant_member(uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_tenant_member(uuid) IS
'Soft-delete (status=left) di una membership. Cancella anche le tma rows associate. '
'Owner/admin: rimuovono qualsiasi non-owner. Manager: solo membri con tma TUTTE nelle '
'sue sedi e non admin. Self-removal bloccata (usa leave_tenant). 42501 / 22023 / 44000.';
