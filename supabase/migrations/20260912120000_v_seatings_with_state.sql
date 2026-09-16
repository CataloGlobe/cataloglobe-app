-- =============================================================================
-- v_seatings_with_state — cosa c'è in sala adesso, tavolata per tavolata
-- =============================================================================
-- La vista di servizio (la schermata che l'host tiene aperta all'ingresso) ha
-- bisogno di una riga per tavolata con dentro, già aggregati, i tavoli che
-- occupa e le prenotazioni che onora. Senza questa view il frontend dovrebbe
-- fare tre letture e ricucirle a mano per ogni riga, oppure una sola con due
-- embed e un cross-product da deduplicare.
--
-- ── Non è `v_tables_with_state` ────────────────────────────────────────────
-- Quella è la view DEL TAVOLO: parte da `tables` e dice cosa succede su
-- ciascuno. Questa è la view DELLA TAVOLATA: parte da `seatings` e dice chi
-- sta dove. Sono due domande diverse con due chiavi diverse, e convivono.
-- Si incontreranno nel BLOCCO 3 (quando `order_groups.seating_id` sarà
-- scritto), non prima. Nessuna modifica all'altra.
--
-- ── security_invoker = on, alla nascita ────────────────────────────────────
-- Non è stile. Senza, la view girerebbe come il suo owner (postgres) e
-- leggerebbe `seatings` bypassando la RLS: chiunque sia `authenticated`
-- vedrebbe le tavolate di tutte le sedi di tutti i tenant. È esattamente
-- l'errore che 20260614114151 ha dovuto correggere a posteriori su
-- `v_tables_with_state`; qui si evita prima che esista.
--
-- Con l'invoker, ogni tabella sotto applica la propria policy SELECT:
--   seatings, seating_tables, seating_reservations → seatings.read
--   tables, table_zones                            → tables.read
--   reservations                                   → reservations.read
-- Conseguenza voluta: un ruolo con `seatings.read` ma senza `tables.read`
-- vede le tavolate con `tables = []`; senza `reservations.read`, con
-- `reservations = []`. Non è un buco: è la RLS che fa il suo mestiere, e i
-- ruoli seed (manager/staff/viewer) hanno tutti e tre i permessi di lettura.
--
-- ── Aggregati via LATERAL, non via GROUP BY ────────────────────────────────
-- Due JOIN 1:N sulla stessa riga (tavoli × prenotazioni) e un GROUP BY
-- darebbero un prodotto cartesiano da deduplicare con DISTINCT dentro ogni
-- aggregato. Due sottoquery LATERAL aggregano ciascuna la propria lista e
-- basta. COALESCE su `'[]'` perché l'array vuoto È un'informazione: una
-- tavolata senza prenotazioni è un walk-in, e il frontend deve poterlo dire
-- senza trattare NULL come caso a parte.
--
-- ── I tavoli includono `deleted_at` ────────────────────────────────────────
-- Una tavolata può puntare a un tavolo soft-deleted (la FK è sull'id, e
-- `set_seating_tables` rifiuta i cancellati solo in INGRESSO). L'host deve
-- poterlo vedere, non scoprirlo perché il tavolo manca dalla lista. Stessa
-- regola di `listSeatingTables` lato service.
--
-- ── Colonne elencate una a una, mai `s.*` ──────────────────────────────────
-- `CREATE OR REPLACE VIEW` può solo appendere colonne in coda: un `s.*` che
-- cambia forma con la tabella romperebbe la view al primo ALTER TABLE. Chi
-- aggiungerà una colonna la metterà in fondo, come in `v_tables_with_state`.
--
-- ── Indici ─────────────────────────────────────────────────────────────────
-- Nessuno nuovo. La query calda della vista di servizio è
--   WHERE activity_id = $1 AND status = 'open'
-- pushata dentro la view, e la copre `idx_seatings_activity_open` (parziale,
-- 20260911100000). Le due LATERAL cercano per `seating_id` e le coprono
-- `idx_seating_tables_seating_id` (20260911100100) e
-- `idx_seating_reservations_seating_id` (20260911100200). `tables`,
-- `table_zones` e `reservations` si raggiungono per chiave primaria.
-- =============================================================================

CREATE VIEW public.v_seatings_with_state
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
    -- I tavoli occupati. Ordine per etichetta, stabile ma non "umano"
    -- ("10" < "2"): quello lo decide chi presenta, con `compareTableLabels`,
    -- come già fa per il piano.
    COALESCE(st.tables, '[]'::jsonb) AS tables,
    -- Le prenotazioni onorate, in ordine di orario. `[]` = walk-in.
    COALESCE(sr.reservations, '[]'::jsonb) AS reservations
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
) sr ON true;

COMMENT ON VIEW public.v_seatings_with_state IS
    'Una riga per tavolata con tavoli occupati e prenotazioni onorate già '
    'aggregati (jsonb). security_invoker=on: la RLS di seatings / '
    'seating_tables / seating_reservations / tables / reservations si '
    'applica al chiamante. `reservations = []` significa walk-in. '
    'Non è v_tables_with_state (view del tavolo): è la view della tavolata.';
