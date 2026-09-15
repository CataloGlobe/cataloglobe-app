-- =============================================================================
-- v_seatings_with_state — gli ordini che aspettano una decisione
-- =============================================================================
-- BLOCCO 3 · FASE 3.2. Due colonne in coda alla view di 20260912120000 (le
-- altre invariate, elencate una a una, `security_invoker` come oggi):
--
--   pending_orders_count        int   — ordini dei conti APERTI della tavolata
--                                       che non sono terminali
--   pending_orders_deliverable  bool  — se «serviti» è una risposta possibile
--
-- ── Perché la schermata deve saperlo PRIMA ─────────────────────────────────
-- `close_seating` (20260915130700) rifiuta con 22023 `OPEN_ORDERS_NEED_ACTION`
-- quando un ordine aspetta una decisione e nessuna `p_action` è stata data.
-- Se la schermata non lo sa prima, l'host preme «Servizio concluso» e riceve
-- un codice: questa colonna è ciò che le permette di fare la domanda invece.
--
-- ── La STESSA condizione del server ────────────────────────────────────────
-- `og.seating_id = s.id AND og.status = 'open'` e
-- `o.status IN ('submitted','acknowledged','ready')`: identica a quella che
-- `close_seating` (punto 5) e `_close_order_group_unchecked` usano per
-- pretendere l'azione. Non una parallela: se divergesse, la schermata farebbe
-- una domanda che il server non fa, o tacerebbe quando il server chiede.
--
-- ── «Serviti» ammissibile ──────────────────────────────────────────────────
-- Il trigger `enforce_order_group_verification` (20260703101000) rifiuta
-- `delivered` su un gruppo mai verificato (`verified_at IS NULL`: nessun
-- ordine è mai stato confermato dal locale). Quindi `deliver` fallirebbe
-- sull'intera chiusura se ANCHE UN SOLO conto aperto con ordini in sospeso non
-- è verificato. `pending_orders_deliverable` è esattamente quel fatto, sulla
-- riga: la schermata non ricostruisce la regola, la legge.
-- true anche quando non c'è niente in sospeso (vacuo): conta solo insieme
-- a `pending_orders_count > 0`.
--
-- ── security_invoker ───────────────────────────────────────────────────────
-- I conteggi passano dalla RLS di `orders` (`orders.read`) e `order_groups`
-- (tenant). Chi ha `seatings.read` ma non `orders.read` legge 0 / true: la
-- schermata non farà la domanda e il server risponderà 22023 — la rete di
-- sicurezza lato client lo dice in italiano. Stesso comportamento delle altre
-- due liste aggregate (tavoli, prenotazioni): un permesso mancante non è un
-- errore, è una lista vuota.
--
-- Non tocca `v_tables_with_state`.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_seatings_with_state
WITH (security_invoker = on) AS
SELECT
    s.id,
    s.tenant_id,
    s.activity_id,
    s.status,
    s.party_size,
    s.opened_at,
    s.closed_at,
    s.closed_reason,
    s.opened_by_user_id,
    COALESCE(st.tables, '[]'::jsonb) AS tables,
    COALESCE(sr.reservations, '[]'::jsonb) AS reservations,
    COALESCE(po.pending_count, 0)::int AS pending_orders_count,
    COALESCE(po.deliverable, true)     AS pending_orders_deliverable
FROM public.seatings s
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
               jsonb_build_object(
                   'table_id',   t.id,
                   'label',      t.label,
                   'zone_name',  tz.name,
                   'deleted_at', t.deleted_at
               )
               ORDER BY t.label, t.id
           ) AS tables
      FROM public.seating_tables x
      JOIN public.tables t        ON t.id = x.table_id
      LEFT JOIN public.table_zones tz ON tz.id = t.zone_id
     WHERE x.seating_id = s.id
) st ON true
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
               jsonb_build_object(
                   'reservation_id',   r.id,
                   'customer_name',    r.customer_name,
                   'reservation_time', r.reservation_time,
                   'party_size',       r.party_size,
                   'status',           r.status
               )
               ORDER BY r.reservation_time, r.id
           ) AS reservations
      FROM public.seating_reservations x
      JOIN public.reservations r ON r.id = x.reservation_id
     WHERE x.seating_id = s.id
) sr ON true
LEFT JOIN LATERAL (
    SELECT count(*)                                        AS pending_count,
           bool_and(og.verified_at IS NOT NULL)            AS deliverable
      FROM public.order_groups og
      JOIN public.orders o ON o.order_group_id = og.id
     WHERE og.seating_id = s.id
       AND og.status = 'open'
       AND o.status IN ('submitted', 'acknowledged', 'ready')
) po ON true;

COMMENT ON VIEW public.v_seatings_with_state IS
    'Una riga per tavolata con tavoli occupati, prenotazioni onorate '
    '(jsonb) e gli ordini dei conti aperti che aspettano una decisione '
    '(pending_orders_count / pending_orders_deliverable). security_invoker=on: '
    'la RLS di seatings / seating_tables / seating_reservations / tables / '
    'reservations / order_groups / orders si applica al chiamante. '
    '`reservations = []` significa walk-in. Non è v_tables_with_state.';
