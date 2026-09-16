-- =============================================================================
-- _open_seating_for_table_unchecked(p_tenant_id, p_activity_id, p_table_id)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1 (1/14). Restituisce l'id della tavolata APERTA che
-- occupa il tavolo; se non ce n'è, la apre.
--
-- ── Perché esiste ──────────────────────────────────────────────────────────
-- Un conto (`order_groups`) nasce al primo ordine, dentro `submit_order_atomic`
-- (20260915130200), quando il tavolo è noto. Qualcuno è seduto lì: è
-- esattamente il fatto che la tavolata registra. Se l'host non l'ha aperta,
-- la apre il sistema — con `opened_by_user_id` NULL, che nel modello
-- significa già "senza un utente dietro" (20260911100000), e `party_size`
-- NULL, che è "non lo sappiamo", non zero.
--
-- ── Quale tavolata ─────────────────────────────────────────────────────────
-- Quella `open` che ha il tavolo in `seating_tables`. Se ce n'è più di una
-- (doppia occupazione: il progetto la mostra, non la impedisce) si prende la
-- più vecchia — la comitiva che era lì per prima — e non se ne apre una terza.
-- Una tavolata CHIUSA sullo stesso tavolo non conta: il servizio si è svolto,
-- e chi ordina adesso è un'altra comitiva → tavolata nuova.
--
-- ── Il gate ────────────────────────────────────────────────────────────────
-- Nessuno. Chi chiama ha già validato il proprio contesto (`submit_order_atomic`
-- ha risolto un QR e una sessione cliente). Le RPC del ciclo tavolata sono
-- inaccessibili da qui (revocate da service_role, `has_permission` con
-- `auth.uid()` NULL): questa è la strada senza utente, e per questo nessun
-- ruolo applicativo la esegue (ACL in 20260915130100). Stesso schema di
-- `_close_seating_unchecked` (20260914160000).
--
-- Lock advisory per sede, come tutte le scritture del ciclo: due primi ordini
-- simultanei da due telefoni allo stesso tavolo si serializzano e il secondo
-- trova la tavolata aperta dal primo — "mai due tavolate per lo stesso
-- gruppo" è garantito qui, non dal chiamante.
-- =============================================================================

CREATE FUNCTION public._open_seating_for_table_unchecked(
    p_tenant_id   uuid,
    p_activity_id uuid,
    p_table_id    uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_seating_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('seating:' || p_activity_id::text, 0)
    );

    SELECT s.id
      INTO v_seating_id
      FROM public.seatings s
      JOIN public.seating_tables st ON st.seating_id = s.id
     WHERE st.table_id   = p_table_id
       AND s.activity_id = p_activity_id
       AND s.tenant_id   = p_tenant_id
       AND s.status      = 'open'
     ORDER BY s.opened_at
     LIMIT 1;

    IF FOUND THEN
        RETURN v_seating_id;
    END IF;

    -- `opened_by_user_id` esplicito: il DEFAULT è auth.uid(), e sotto un JWT
    -- cliente o service_role non deve entrare niente per caso.
    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_by_user_id)
    VALUES (p_tenant_id, p_activity_id, NULL, NULL)
    RETURNING id INTO v_seating_id;

    INSERT INTO public.seating_tables (tenant_id, activity_id, seating_id, table_id)
    VALUES (p_tenant_id, p_activity_id, v_seating_id, p_table_id);

    RETURN v_seating_id;
END;
$$;
