-- =============================================================================
-- open_walkin_seating(p_activity_id, p_table_ids, p_party_size) — senza prenotazione
-- =============================================================================
-- Arriva gente che non aveva prenotato. In un ristorante è metà dei coperti,
-- non un caso di bordo: la tavolata deve poter nascere senza che esista una
-- prenotazione da cui derivarla, altrimenti la vista di sala racconta solo
-- mezza serata e l'occupazione dei tavoli è sistematicamente sottostimata.
--
-- Nessuna riga in `seating_reservations`: una tavolata senza prenotazioni è un
-- walk-in, e si riconosce proprio dall'assenza.
--
-- ── Tutto è facoltativo, di proposito ──────────────────────────────────────
-- `p_table_ids` può essere vuoto: si siedono e il tavolo si decide dopo, o non
-- si decide affatto in una sede che non mappa la sala.
-- `p_party_size` può essere NULL: l'host spesso non lo sa ancora, e obbligarlo
-- a inventare un numero significa avere un numero inventato nel database.
--
-- Il gesto non deve mai bloccarsi su un dato che l'host non ha: chi è in piedi
-- davanti al bancone si siede comunque, e il software o lo registra o viene
-- aggirato.
--
-- ── I tavoli si verificano, la libertà no ──────────────────────────────────
-- I tavoli devono esistere, appartenere a QUESTA sede e a questo tenant, non
-- essere soft-deleted. Un solo tavolo non valido fa fallire tutto: nessuna
-- riga scritta.
--
-- Non si verifica invece che siano LIBERI. È l'invariante del progetto: la
-- doppia occupazione si mostra, non si impedisce. In sala succede davvero — un
-- tavolo liberato di fretta, una tavolata chiusa in ritardo — e un rifiuto qui
-- trasformerebbe un'anomalia visibile in un errore che blocca l'operatore nel
-- momento peggiore.
--
-- ── Permesso: 42501 unico per non-trovato e non-autorizzato ────────────────
-- Come le altre quattro. Sede inesistente e sede non propria danno lo stesso
-- errore: la RPC non fa da oracolo di esistenza di uuid altrui.
--
-- ACL in 20260911130500..130700 (un comando per file).
-- =============================================================================

CREATE FUNCTION public.open_walkin_seating(
    p_activity_id uuid,
    p_table_ids   uuid[],
    p_party_size  int
)
RETURNS public.seatings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant_id uuid;
    v_requested int;
    v_valid     int;
    v_seating   public.seatings;
BEGIN
    -- 1. Sede + permesso. Errore uniforme (vedi header).
    SELECT a.tenant_id
      INTO v_tenant_id
      FROM public.activities a
     WHERE a.id = p_activity_id;

    IF NOT FOUND OR NOT public.has_permission('seatings.manage', p_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: activity not accessible' USING ERRCODE = '42501';
    END IF;

    -- 2. Coperti: facoltativi, ma se dichiarati devono avere senso. Lo stesso
    --    CHECK vive sulla tabella; qui l'errore è 22023 invece di 23514, cioè
    --    "input non valido" invece di "vincolo violato".
    IF p_party_size IS NOT NULL AND p_party_size <= 0 THEN
        RAISE EXCEPTION 'p_party_size must be greater than zero' USING ERRCODE = '22023';
    END IF;

    -- 3. Tavoli: NULL e array vuoto sono entrambi "nessun tavolo". Qui, a
    --    differenza di `set_seating_tables`, NULL non è ambiguo — non c'è
    --    nessuna assegnazione precedente che si possa cancellare per sbaglio.
    v_requested := COALESCE(cardinality(p_table_ids), 0);

    IF v_requested > 0 THEN
        IF EXISTS (SELECT 1 FROM unnest(p_table_ids) AS x WHERE x IS NULL) THEN
            RAISE EXCEPTION 'NULL element in p_table_ids' USING ERRCODE = '22023';
        END IF;

        IF (SELECT count(DISTINCT x) FROM unnest(p_table_ids) AS x) <> v_requested THEN
            RAISE EXCEPTION 'Duplicate table_id in p_table_ids' USING ERRCODE = '22023';
        END IF;

        PERFORM pg_advisory_xact_lock(
            hashtextextended('seating:' || p_activity_id::text, 0)
        );

        SELECT count(*)
          INTO v_valid
          FROM public.tables t
         WHERE t.id = ANY (p_table_ids)
           AND t.activity_id = p_activity_id
           AND t.tenant_id   = v_tenant_id
           AND t.deleted_at IS NULL;

        IF v_valid <> v_requested THEN
            RAISE EXCEPTION 'FORBIDDEN: one or more tables not accessible'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 4. La tavolata. Nessuna riga in `seating_reservations`: è questo che la
    --    rende un walk-in.
    INSERT INTO public.seatings (tenant_id, activity_id, party_size)
    VALUES (v_tenant_id, p_activity_id, p_party_size)
    RETURNING * INTO v_seating;

    IF v_requested > 0 THEN
        INSERT INTO public.seating_tables (tenant_id, activity_id, seating_id, table_id)
        SELECT v_tenant_id, p_activity_id, v_seating.id, x
          FROM unnest(p_table_ids) AS x;
    END IF;

    RETURN v_seating;
END;
$$;
