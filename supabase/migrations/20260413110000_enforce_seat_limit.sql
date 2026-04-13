-- Enforce seat limit: prevent creating more activities than paid_seats allows.
-- This is a server-side safety net; the frontend also validates before calling createActivity.

CREATE OR REPLACE FUNCTION enforce_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_count INTEGER;
    max_seats     INTEGER;
BEGIN
    SELECT COUNT(*) INTO current_count
    FROM activities
    WHERE tenant_id = NEW.tenant_id;

    SELECT paid_seats INTO max_seats
    FROM tenants
    WHERE id = NEW.tenant_id;

    IF max_seats IS NULL THEN
        -- Tenant not found — let the FK constraint handle it
        RETURN NEW;
    END IF;

    IF current_count >= max_seats THEN
        RAISE EXCEPTION 'Limite sedi raggiunto: % di % sedi utilizzate',
            current_count, max_seats
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_seat_limit
    BEFORE INSERT ON activities
    FOR EACH ROW
    EXECUTE FUNCTION enforce_seat_limit();
