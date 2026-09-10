-- =============================================================================
-- reset_reservation_tables_to_system(p_reservation_id) — restituisce al sistema
-- =============================================================================
-- Secondo gesto dell'operatore (FASE 4): annulla una decisione manuale.
-- Cancella TUTTE le righe della prenotazione (manual e system) e richiama
-- subito il motore, che riassegna da zero secondo le sue regole (P1 singolo
-- contenente, P2 minimo rilassato, P3 accostamento) sullo stato corrente
-- della sala. Ritorna l'esito del motore così com'è: una riga per tavolo
-- assegnato, oppure una riga (NULL, false, reason).
--
-- Cancellare prima è necessario: il motore, trovando anche una sola riga
-- manual, esce con `manual_assignment` senza toccare nulla. Qui la volontà
-- dell'operatore è proprio quella di togliere il vincolo.
--
-- ── Solo prenotazioni attive (22023 altrimenti) ─────────────────────────────
-- Su status diverso da pending | confirmed | seated la funzione rifiuta con
-- 22023 PRIMA di cancellare. Le righe di ponte devono sopravvivere alla
-- disdetta: è la decisione che regge il ripristino dopo undo (una disdetta
-- annullata ritrova i suoi tavoli senza riassegnazione) e lo storico di chi
-- sedeva dove (20260907120200). Senza questa guardia un reset su una
-- prenotazione annullata cancellerebbe tutto e il motore risponderebbe
-- `inactive_status` senza riscrivere nulla: storico perso, e al ripristino
-- una riassegnazione da zero. Il controllo sta DOPO il gate 42501: non fa da
-- oracolo di esistenza.
--
-- ── Permesso: 42501 unico per non-trovato e non-autorizzato ─────────────────
-- `has_permission('reservations.manage', activity_id)`, modello
-- `regenerate_table_qr_token`. SECURITY DEFINER: il controllo è qui, la RLS
-- non protegge nulla. Necessario anche per un secondo motivo: il motore è
-- revocato a ogni ruolo client (20260907150400) e solo il proprietario può
-- eseguirlo — questa funzione è il punto d'ingresso autorizzato.
--
-- ── Lock ────────────────────────────────────────────────────────────────────
-- Stessa chiave del motore, presa qui prima della DELETE e riacquisita
-- re-entrant dal motore: dalla cancellazione alla riassegnazione nessun altro
-- vede lo stato intermedio.
--
-- ── RETURNS TABLE e alias ───────────────────────────────────────────────────
-- La colonna OUT `table_id` è in scope nel body: ogni riferimento è
-- qualificato con alias (gotcha 20260530190000).
--
-- ACL in 20260907170300..170500.
-- =============================================================================

CREATE FUNCTION public.reset_reservation_tables_to_system(
    p_reservation_id uuid
)
RETURNS TABLE (
    table_id uuid,
    assigned boolean,
    reason   text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_activity_id uuid;
    v_status      text;
BEGIN
    -- 1. Prenotazione + permesso. Errore uniforme.
    SELECT r.activity_id, r.status
      INTO v_activity_id, v_status
      FROM public.reservations r
     WHERE r.id = p_reservation_id;

    IF NOT FOUND OR NOT public.has_permission('reservations.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: reservation not accessible' USING ERRCODE = '42501';
    END IF;

    -- 1b. Solo prenotazioni attive: le righe di ponte di una disdetta devono
    --     sopravvivere (ripristino dopo undo, storico).
    IF v_status NOT IN ('pending', 'confirmed', 'seated') THEN
        RAISE EXCEPTION 'Reservation is not active (status %)', v_status USING ERRCODE = '22023';
    END IF;

    -- 2. Lock per sede, stessa chiave del motore.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('reservation:' || v_activity_id::text, 0)
    );

    -- 3. Via tutto, manual compreso: è il senso del gesto.
    DELETE FROM public.reservation_tables rt
     WHERE rt.reservation_id = p_reservation_id;

    -- 4. Il motore riassegna da zero e decide lui l'esito.
    RETURN QUERY
        SELECT a.table_id, a.assigned, a.reason
          FROM public.assign_tables_for_reservation(p_reservation_id) AS a;
END;
$$;
