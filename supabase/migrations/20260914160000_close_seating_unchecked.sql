-- =============================================================================
-- _close_seating_unchecked(p_seating_id, p_reason) — il cuore di close_seating
-- =============================================================================
-- Gli EFFETTI della chiusura, senza il gate: `status`, `closed_at`,
-- `closed_reason`, e le prenotazioni `seated` che passano a `completed`.
--
-- ── Perché esiste ──────────────────────────────────────────────────────────
-- `close_seating` (20260911130300) verifica `has_permission('seatings.manage')`
-- prima di chiudere. Sotto cron `auth.uid()` è NULL, `has_permission` è
-- sempre falso, e la chiusura automatica di fine giornata non potrebbe mai
-- passare da lì. Duplicare gli effetti in una seconda funzione vorrebbe dire
-- due posti da tenere allineati sulla semantica della chiusura — il tipo di
-- debito che questa fase evita. Quindi gli effetti stanno QUI, una volta, e
-- chi ha un gate proprio (l'operatore via `close_seating`, il cron via
-- `close_stale_seatings`) li chiama dopo aver deciso.
--
-- ── Cosa NON fa ────────────────────────────────────────────────────────────
-- Nessun permesso, nessuna validazione del motivo oltre il CHECK della
-- tabella (23514). Non è una RPC: nessun ruolo applicativo può eseguirla
-- (ACL in 20260914160100, revoca da PUBLIC/anon/authenticated/service_role,
-- nessun GRANT). La chiamano solo altre funzioni SECURITY DEFINER dello
-- stesso owner.
--
-- ── Comportamento, identico a close_seating punti 3..5 ─────────────────────
-- - Lock advisory per sede, come tutte le RPC del ciclo (serializza con
--   `undo_seating`: chi chiude e chi annulla si mettono in fila).
-- - L'UPDATE porta il predicato `status = 'open'`: già chiusa (o chiusa da
--   un'altra sessione nel frattempo) ⇒ NESSUN timestamp toccato, si
--   restituisce la riga com'è. `closed_at` racconta quando il servizio è
--   finito davvero.
-- - Specchio sulle prenotazioni: solo quelle in `seated`, mai le altre.
-- - Seating inesistente ⇒ NULL. Il chiamante che vuole un 42501 se lo
--   costruisce prima (come fa `close_seating`).
--
-- ACL in 20260914160100. `close_seating` delega qui da 20260914160200.
-- =============================================================================

CREATE FUNCTION public._close_seating_unchecked(
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
    v_seating     public.seatings;
BEGIN
    SELECT s.activity_id
      INTO v_activity_id
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('seating:' || v_activity_id::text, 0)
    );

    UPDATE public.seatings s
       SET status        = 'closed',
           closed_at     = now(),
           closed_reason = p_reason
     WHERE s.id = p_seating_id
       AND s.status = 'open'
    RETURNING * INTO v_seating;

    IF NOT FOUND THEN
        -- Già chiusa, prima o durante: la riga com'è, timestamp intatti.
        SELECT s.* INTO v_seating FROM public.seatings s WHERE s.id = p_seating_id;
        RETURN v_seating;
    END IF;

    UPDATE public.reservations r
       SET status       = 'completed',
           completed_at = now()
     WHERE r.id IN (
               SELECT sr.reservation_id
                 FROM public.seating_reservations sr
                WHERE sr.seating_id = p_seating_id
           )
       AND r.status = 'seated';

    RETURN v_seating;
END;
$$;
