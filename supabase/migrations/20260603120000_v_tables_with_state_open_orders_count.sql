-- v_tables_with_state: aggiunta `open_orders_count` (colonna in fondo).
--
-- Motivazione: `pending_orders_count` esistente conta solo
-- (submitted, acknowledged) — semantica "in cucina o da consegnare".
-- E' usato da UI con label specifiche (`TablesLiveView` badge "N pending",
-- `TableCloseDrawer` label "Ordini in cucina o da consegnare",
-- `OrdersKpiBar` KPI "Comande in lavorazione"). Estenderlo a includere
-- `ready` cambierebbe SEMANTICA dei 4 consumer attuali.
--
-- Aggiungiamo invece una colonna SEPARATA `open_orders_count` che
-- include tutti gli stati non-terminali (`submitted, acknowledged,
-- ready`). Usata dalla nuova logica close-table per gate dei bottoni
-- "Segna tutte come servite e chiudi" / "Annulla tutte e chiudi".
--
-- `CREATE OR REPLACE VIEW` ha un vincolo: puo' solo APPENDERE colonne
-- in fondo, non inserirle in mezzo. La nuova colonna va in posizione
-- 18 (dopo `bill_requested_count`, ultima nella view attuale, ord 17).
-- L'ordine delle 17 colonne pre-esistenti e' riprodotto IDENTICO a
-- quanto restituito da `information_schema.columns` per
-- `public.v_tables_with_state` (ordinal_position 1..17), per evitare
-- "cannot change name of view column".
--
-- security_invoker: NON impostato in questa migration. Status quo
-- preservato (la view oggi NON ha `security_invoker = true`; in
-- PG15+ default = esegue come owner, bypassando RLS delle sorgenti).
-- E' un finding pre-esistente di tenant isolation che merita una
-- migration di security dedicata + smoke test esteso su tutti i
-- consumer. NON e' in scope qui (questa migration e' un'estensione
-- funzionale, no impact security boundary).

CREATE OR REPLACE VIEW public.v_tables_with_state AS
SELECT
    -- ─── 17 colonne pre-esistenti, ordine identico a oggi ───
    t.id,
    t.tenant_id,
    t.activity_id,
    t.label,
    t.qr_token,
    t.seats,
    t.zone_id,
    tz.name AS zone_name,
    t.maintenance_mode,
    t.deleted_at,
    t.created_at,
    t.updated_at,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now()) AS active_sessions_count,
    count(DISTINCT o.id) FILTER (WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text])) AS pending_orders_count,
    count(DISTINCT og.id) FILTER (WHERE og.status = 'open'::text) AS open_groups_count,
    COALESCE(
        sum(o.total_amount) FILTER (
            WHERE (o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'delivered'::text]))
              AND o.is_rectification = false
        )
        - sum(o.total_amount) FILTER (
            WHERE (o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'delivered'::text]))
              AND o.is_rectification = true
        ),
        0::numeric
    ) AS current_total,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.bill_requested_at IS NOT NULL) AS bill_requested_count,
    -- ─── NUOVA colonna (posizione 18) ───
    count(DISTINCT o.id) FILTER (
        WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text])
    ) AS open_orders_count
FROM public.tables t
    LEFT JOIN public.table_zones tz ON tz.id = t.zone_id
    LEFT JOIN public.customer_sessions cs ON cs.current_table_id = t.id
    LEFT JOIN public.orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
    LEFT JOIN public.order_groups og ON og.table_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id, tz.name;

COMMENT ON VIEW public.v_tables_with_state IS
    'Tavoli arricchiti con stato derivato. `pending_orders_count` = '
    'submitted+acknowledged (UI "in cucina"). `open_orders_count` = '
    'submitted+acknowledged+ready (UI "aperti", base per gate di '
    'close-table). Non includere `delivered` ne'' `cancelled` in '
    'questi conteggi.';
