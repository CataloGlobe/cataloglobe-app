-- =============================================================================
-- Fase 5.B.2 — get_tenant_members rewrite (v2)
--
-- Estende la firma per restituire effective_role + activity_ids + activity_names
-- + owner synthetic row. La vecchia firma ritornava solo `role` raw (NULL per
-- ruoli activity-scoped) ed escludeva l'owner (owner non ha riga in
-- tenant_memberships).
--
-- Cambio firma:
--   OLD: RETURNS TABLE(membership_id, tenant_id, user_id, email, role, status,
--                      invited_by, inviter_email, invite_token,
--                      invite_expires_at, created_at)
--   NEW: RETURNS TABLE(membership_id, user_id, email, effective_role, status,
--                      activity_ids, activity_names, invited_at,
--                      invited_by_email, invite_expires_at, created_at)
--
-- Auth: has_permission('team.read', NULL) richiesto.
--   - owner/admin/manager: ✓ (vedono la lista)
--   - staff/viewer: ✗ → 42501
--
-- ORDER BY priority: owner (0), admin (1), manager (2), staff (3), viewer (4)
-- → secondario: created_at ASC.
--
-- Owner synthetic row:
--   membership_id = '00000000-...' costante? NO: usiamo gen_random_uuid()
--   non era una buona idea (instabile tra chiamate). Meglio:
--   membership_id = '00000000-0000-0000-0000-000000000000' (sentinel) per
--   permettere al frontend di disambiguare "non è una vera membership_id".
--   Tutti gli altri campi popolati da tenants + auth.users.
--   status = NULL (segnale "non-membership").
--
-- Aggiorna anche `src/types/team.ts` lato frontend (firma TS sincronizzata).
-- =============================================================================

-- DROP vecchia firma (cambio cols richiede DROP esplicito)
DROP FUNCTION IF EXISTS public.get_tenant_members(uuid);

CREATE OR REPLACE FUNCTION public.get_tenant_members(p_tenant_id uuid)
RETURNS TABLE(
  membership_id      uuid,
  user_id            uuid,
  email              text,
  effective_role     text,
  status             text,
  activity_ids       uuid[],
  activity_names     text[],
  invited_at         timestamptz,
  invited_by_email   text,
  invite_expires_at  timestamptz,
  created_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta'
      USING ERRCODE = '42501';
  END IF;

  -- Auth: caller deve avere team.read (owner/admin/manager)
  IF NOT public.has_permission('team.read', NULL) THEN
    RAISE EXCEPTION 'Permesso negato: il tuo ruolo non consente di visualizzare il team'
      USING ERRCODE = '42501';
  END IF;

  -- Hardening: caller deve appartenere al tenant indicato (has_permission senza
  -- tenant filter ammette permission grant su qualsiasi tenant del caller)
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = p_tenant_id
        AND t.owner_user_id = v_uid
        AND t.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id   = v_uid
        AND tm.status    = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Permesso negato: non appartieni a questa azienda'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH owner_row AS (
    SELECT
      '00000000-0000-0000-0000-000000000000'::uuid       AS membership_id,
      t.owner_user_id                                    AS user_id,
      COALESCE(u.email, '')::text                        AS email,
      'owner'::text                                      AS effective_role,
      NULL::text                                         AS status,
      ARRAY[]::uuid[]                                    AS activity_ids,
      ARRAY[]::text[]                                    AS activity_names,
      NULL::timestamptz                                  AS invited_at,
      NULL::text                                         AS invited_by_email,
      NULL::timestamptz                                  AS invite_expires_at,
      t.created_at                                       AS created_at,
      0                                                  AS sort_priority
    FROM public.tenants t
    LEFT JOIN auth.users u ON u.id = t.owner_user_id
    WHERE t.id = p_tenant_id
      AND t.deleted_at IS NULL
  ),
  membership_rows AS (
    SELECT
      tm.id AS membership_id,
      tm.user_id,
      COALESCE(u.email, tm.invited_email, '')::text AS email,
      -- effective_role: admin se tm.role, altrimenti primo tma.role per priorità
      COALESCE(
        tm.role,
        (
          SELECT tma_inner.role
          FROM public.tenant_membership_activities tma_inner
          WHERE tma_inner.tenant_membership_id = tm.id
          ORDER BY CASE tma_inner.role
                     WHEN 'manager' THEN 1
                     WHEN 'staff'   THEN 2
                     WHEN 'viewer'  THEN 3
                     ELSE 99
                   END
          LIMIT 1
        ),
        'unknown'
      )::text AS effective_role,
      tm.status::text AS status,
      -- activity_ids: ARRAY ordinato per id, vuoto per admin/null
      COALESCE(
        (
          SELECT ARRAY_AGG(tma_a.activity_id ORDER BY tma_a.activity_id)
          FROM public.tenant_membership_activities tma_a
          WHERE tma_a.tenant_membership_id = tm.id
        ),
        ARRAY[]::uuid[]
      ) AS activity_ids,
      -- activity_names: stesso ordering (JOIN activities)
      COALESCE(
        (
          SELECT ARRAY_AGG(act.name ORDER BY tma_n.activity_id)
          FROM public.tenant_membership_activities tma_n
          JOIN public.activities act ON act.id = tma_n.activity_id
          WHERE tma_n.tenant_membership_id = tm.id
        ),
        ARRAY[]::text[]
      ) AS activity_names,
      tm.invite_sent_at AS invited_at,
      inviter.email::text AS invited_by_email,
      tm.invite_expires_at,
      tm.created_at,
      -- sort_priority: 1=admin, 2=manager, 3=staff, 4=viewer, 99=unknown
      CASE
        WHEN tm.role = 'admin' THEN 1
        ELSE COALESCE(
          (
            SELECT CASE tma_p.role
                     WHEN 'manager' THEN 2
                     WHEN 'staff'   THEN 3
                     WHEN 'viewer'  THEN 4
                     ELSE 99
                   END
            FROM public.tenant_membership_activities tma_p
            WHERE tma_p.tenant_membership_id = tm.id
            ORDER BY CASE tma_p.role
                       WHEN 'manager' THEN 1
                       WHEN 'staff'   THEN 2
                       WHEN 'viewer'  THEN 3
                       ELSE 99
                     END
            LIMIT 1
          ),
          99
        )
      END AS sort_priority
    FROM public.tenant_memberships tm
    LEFT JOIN auth.users u       ON u.id       = tm.user_id
    LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by
    WHERE tm.tenant_id = p_tenant_id
  )
  SELECT
    membership_id, user_id, email, effective_role, status,
    activity_ids, activity_names, invited_at, invited_by_email,
    invite_expires_at, created_at
  FROM (
    SELECT * FROM owner_row
    UNION ALL
    SELECT * FROM membership_rows
  ) all_rows
  ORDER BY sort_priority ASC, created_at ASC;
END;
$function$;

-- Lockdown grants
REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_tenant_members(uuid) IS
'Lista membri del tenant con effective_role + activity_ids + activity_names. '
'Owner synthetic row first (membership_id sentinel 00000000-0000-0000-0000-000000000000, '
'status=NULL). Membership rows ordinati per ruolo (admin>manager>staff>viewer) poi created_at. '
'RAISE 42501 se caller non ha team.read o non appartiene al tenant.';
