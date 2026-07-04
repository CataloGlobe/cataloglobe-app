-- Kill-switch QR regeneration. Replaces the client-side direct UPDATE on
-- tables.qr_token with a SECURITY DEFINER RPC that (1) enforces tables.manage
-- server-side, (2) rotates the token, (3) optionally expires active sessions
-- on that table. auth.uid() reflects the caller's JWT even under DEFINER.
--
-- CREATE-only migration, no explicit BEGIN;/COMMIT; wrapper: db push runs each
-- migration in its own transaction, and wrapping a dollar-quoted CREATE FUNCTION
-- with BEGIN;/COMMIT; triggers SQLSTATE 42601 (see 20260703090500).
CREATE OR REPLACE FUNCTION public.regenerate_table_qr_token(
    p_table_id                  uuid,
    p_terminate_active_sessions boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_activity_id uuid;
    v_tenant_id   uuid;
    v_new_token   uuid := gen_random_uuid();
BEGIN
    SELECT t.activity_id, t.tenant_id INTO v_activity_id, v_tenant_id
      FROM public.tables t
     WHERE t.id = p_table_id AND t.deleted_at IS NULL;

    -- Uniform error for BOTH "table does not exist" and "caller lacks
    -- tables.manage on this table's activity". The caller must not be able to
    -- distinguish a missing table from a forbidden one, otherwise the RPC
    -- becomes a cross-tenant existence oracle for table UUIDs. plpgsql OR is
    -- short-circuit, so has_permission() is never evaluated with a NULL
    -- activity_id when the row was not found.
    IF NOT FOUND OR NOT public.has_permission('tables.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: table not accessible' USING ERRCODE = '42501';
    END IF;

    UPDATE public.tables
       SET qr_token = v_new_token, updated_at = now()
     WHERE id = p_table_id;

    IF p_terminate_active_sessions THEN
        UPDATE public.customer_sessions
           SET expires_at = now(), updated_at = now()
         WHERE current_table_id = p_table_id
           AND tenant_id = v_tenant_id
           AND expires_at > now();
    END IF;

    RETURN v_new_token;
END;
$function$;
