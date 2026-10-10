-- =============================================================================
-- can_write_schedule: un gruppo è «suo» solo se lo sono tutte le sue sedi (D13)
-- =============================================================================
--
-- Prima: un ruolo di sede con scheduling.write poteva modificare una regola
-- su un gruppo se nel gruppo c'era ALMENO UNA sua sede. Un manager di
-- Comasina modificava così una regola su «Comasina + Garbagnate», che cambia
-- anche Garbagnate.
--
-- Ora: come update_schedule_targets e create_schedule_with_targets, che per
-- assegnare un gruppo vogliono TUTTE le sedi del gruppo tra le proprie.
-- Resta richiesto che il gruppo abbia almeno una sede: un gruppo vuoto non
-- conta come suo (era già così). Il controllo si stringe soltanto: chi poteva
-- scrivere una regola su sole sedi o gruppi interamente suoi continua a farlo.
--
-- Stessa migration, seconda stretta (dalla rilettura della PR): una sede conta
-- solo se il chiamante ci ha scheduling.write. Prima bastava esserci con un
-- ruolo qualunque (get_my_activity_ids), quindi un manager di A e viewer di B
-- scriveva regole su B. Ora decide has_permission sulla sede.
--
-- Owner/admin e apply_to_all invariati. Le policy delle tabelle figlie
-- (20261007170000) usano questa funzione e seguono da sole.
--
-- Base: pg_get_functiondef su staging del 2026-10-10 (uguale a 20260720160001).
-- CREATE OR REPLACE tiene i GRANT (authenticated, service_role).
-- Specchio lato client: canWriteRule in src/lib/permissions.ts.
-- Test: supabase/tests/can_write_schedule_group.test.sql (staging).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_write_schedule(p_schedule_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.id = p_schedule_id
      AND s.tenant_id IN (SELECT public.get_my_tenant_ids())
      AND (
        -- Owner/admin: full write. Keyed on s.tenant_id.
        public.has_permission_owner_admin('scheduling.write', s.tenant_id)
        OR (
          -- Activity-scoped role with scheduling.write in this tenant.
          public.has_permission_any_activity('scheduling.write', s.tenant_id)
          -- apply_to_all is a tenant-wide mutation — reserved to owner/admin.
          AND s.apply_to_all = false
          -- The schedule must have at least one target. A row with
          -- apply_to_all=false AND no targets is anomalous; deny by default.
          AND EXISTS (
            SELECT 1 FROM public.schedule_targets st
            WHERE st.schedule_id = s.id
          )
          -- Every target must be one the caller can write: an activity
          -- where they hold scheduling.write, or a non-empty group whose
          -- members are ALL such activities (D13). has_permission is
          -- correlated to the activity's tenant (20260707120000) and checks
          -- the role on THAT activity: a viewer seat no longer counts.
          AND NOT EXISTS (
            SELECT 1 FROM public.schedule_targets st
            WHERE st.schedule_id = s.id
              AND NOT (
                (st.target_type = 'activity'
                  AND public.has_permission('scheduling.write', st.target_id))
                OR (st.target_type = 'activity_group'
                  AND EXISTS (
                    SELECT 1 FROM public.activity_group_members agm
                    WHERE agm.group_id = st.target_id
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM public.activity_group_members agm
                    WHERE agm.group_id = st.target_id
                      AND NOT public.has_permission('scheduling.write', agm.activity_id)
                  ))
              )
          )
        )
      )
  );
$function$;
