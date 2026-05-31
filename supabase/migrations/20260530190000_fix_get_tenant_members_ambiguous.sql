-- =============================================================================
-- Fix bug — get_tenant_members: column reference "membership_id" is ambiguous
--
-- Causa: la versione precedente (20260530180000) usava nei CTE owner_row +
-- membership_rows alias identici alle colonne OUT della RETURNS TABLE
-- (membership_id, user_id, email, ecc.). Dentro il body plpgsql le colonne OUT
-- sono in scope come variabili → Postgres non riusciva a disambiguare nel
-- SELECT finale + ORDER BY.
--
-- Fix: prefisso `r_` su tutti gli alias delle CTE. Il SELECT finale mappa
-- esplicitamente r_* → nomi colonna RETURNS TABLE.
-- Semantica e firma INVARIATE.
-- =============================================================================

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

  IF NOT public.has_permission('team.read', NULL) THEN
    RAISE EXCEPTION 'Permesso negato: il tuo ruolo non consente di visualizzare il team'
      USING ERRCODE = '42501';
  END IF;

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
      '00000000-0000-0000-0000-000000000000'::uuid       AS r_membership_id,
      t.owner_user_id                                    AS r_user_id,
      COALESCE(u.email, '')::text                        AS r_email,
      'owner'::text                                      AS r_effective_role,
      NULL::text                                         AS r_status,
      ARRAY[]::uuid[]                                    AS r_activity_ids,
      ARRAY[]::text[]                                    AS r_activity_names,
      NULL::timestamptz                                  AS r_invited_at,
      NULL::text                                         AS r_invited_by_email,
      NULL::timestamptz                                  AS r_invite_expires_at,
      t.created_at                                       AS r_created_at,
      0                                                  AS r_sort_priority
    FROM public.tenants t
    LEFT JOIN auth.users u ON u.id = t.owner_user_id
    WHERE t.id = p_tenant_id
      AND t.deleted_at IS NULL
  ),
  membership_rows AS (
    SELECT
      tm.id                                          AS r_membership_id,
      tm.user_id                                     AS r_user_id,
      COALESCE(u.email, tm.invited_email, '')::text  AS r_email,
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
      )::text                                        AS r_effective_role,
      tm.status::text                                AS r_status,
      COALESCE(
        (
          SELECT ARRAY_AGG(tma_a.activity_id ORDER BY tma_a.activity_id)
          FROM public.tenant_membership_activities tma_a
          WHERE tma_a.tenant_membership_id = tm.id
        ),
        ARRAY[]::uuid[]
      )                                              AS r_activity_ids,
      COALESCE(
        (
          SELECT ARRAY_AGG(act.name ORDER BY tma_n.activity_id)
          FROM public.tenant_membership_activities tma_n
          JOIN public.activities act ON act.id = tma_n.activity_id
          WHERE tma_n.tenant_membership_id = tm.id
        ),
        ARRAY[]::text[]
      )                                              AS r_activity_names,
      tm.invite_sent_at                              AS r_invited_at,
      inviter.email::text                            AS r_invited_by_email,
      tm.invite_expires_at                           AS r_invite_expires_at,
      tm.created_at                                  AS r_created_at,
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
      END                                            AS r_sort_priority
    FROM public.tenant_memberships tm
    LEFT JOIN auth.users u       ON u.id       = tm.user_id
    LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by
    WHERE tm.tenant_id = p_tenant_id
  )
  SELECT
    all_rows.r_membership_id     AS membership_id,
    all_rows.r_user_id           AS user_id,
    all_rows.r_email             AS email,
    all_rows.r_effective_role    AS effective_role,
    all_rows.r_status            AS status,
    all_rows.r_activity_ids      AS activity_ids,
    all_rows.r_activity_names    AS activity_names,
    all_rows.r_invited_at        AS invited_at,
    all_rows.r_invited_by_email  AS invited_by_email,
    all_rows.r_invite_expires_at AS invite_expires_at,
    all_rows.r_created_at        AS created_at
  FROM (
    SELECT * FROM owner_row
    UNION ALL
    SELECT * FROM membership_rows
  ) all_rows
  ORDER BY all_rows.r_sort_priority ASC, all_rows.r_created_at ASC;
END;
$function$;

-- Lockdown grants (identici, idempotenti)
REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated;
