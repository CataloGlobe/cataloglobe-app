-- =============================================================================
-- close_seating(p_seating_id, p_reason) — ora delega a _close_seating_unchecked
-- =============================================================================
-- Stessa firma, stesso ritorno, stessi errori, stessa idempotenza di
-- 20260911130300. Cambia solo DOVE vivono gli effetti: i punti 3..5 di quella
-- versione (lock, UPDATE con predicato `status = 'open'`, specchio sulle
-- prenotazioni `seated`) stanno in `_close_seating_unchecked`
-- (20260914160000), condivisi con la chiusura automatica.
--
-- Cosa resta qui, nell'ordine di prima:
--   1. tavolata + permesso  → 42501 uniforme (anche se non esiste)
--   2. motivo               → 22023 se non è operator | auto
--   3. già chiusa           → la riga com'è, nessun timestamp toccato
--
-- Il punto 3 è ridondante rispetto all'UPDATE condizionale del cuore (che
-- restituirebbe comunque la riga intatta), ma resta per non cambiare di una
-- virgola il percorso osservabile: nessun lock preso su una tavolata già
-- chiusa, come prima.
--
-- CREATE OR REPLACE conserva l'ACL esistente (20260911130500..130700:
-- authenticated=true, anon/service_role=false). Nessuna migration ACL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.close_seating(
    p_seating_id uuid,
    p_reason     text
)
RETURNS public.seatings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_activity_id uuid;
    v_status      text;
    v_seating     public.seatings;
BEGIN
    -- 1. Tavolata + permesso. Errore uniforme.
    SELECT s.activity_id, s.status
      INTO v_activity_id, v_status
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND OR NOT public.has_permission('seatings.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: seating not accessible' USING ERRCODE = '42501';
    END IF;

    -- 2. Il motivo è obbligatorio e ha due soli valori. Lo stesso CHECK vive
    --    sulla tabella; qui l'errore è 22023 invece di 23514.
    IF p_reason IS NULL OR p_reason NOT IN ('operator', 'auto') THEN
        RAISE EXCEPTION 'p_reason must be one of operator | auto' USING ERRCODE = '22023';
    END IF;

    -- 3. Già chiusa: si restituisce com'è, senza toccare i timestamp.
    IF v_status = 'closed' THEN
        SELECT s.* INTO v_seating FROM public.seatings s WHERE s.id = p_seating_id;
        RETURN v_seating;
    END IF;

    -- 4. Gli effetti, una volta sola, nel cuore condiviso.
    RETURN public._close_seating_unchecked(p_seating_id, p_reason);
END;
$$;
