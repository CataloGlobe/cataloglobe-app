-- v_tables_with_state: estende `current_total` per includere `ready`.
--
-- Migration 20260603120000 ha aggiunto `open_orders_count` con filter
-- `submitted+acknowledged+ready` per gate di close-table, ma il filter
-- di `current_total` e' rimasto a `submitted+acknowledged+delivered`
-- (senza `ready`). Conseguenza: tavoli con SOLO ordini in `ready`
-- mostrano `current_total = 0` pur avendo bill reale (l'ordine in
-- ready e' un ordine confermato dal cliente e accettato dalla cucina,
-- sicuramente parte del conto del tavolo).
--
-- Fix: aggiungere `ready` ai due FILTER (riga non-rectification e riga
-- rectification) della COALESCE di `current_total`. Nient'altro cambia.
-- Stesse colonne, stesso ordine, nessuna nuova reloption (la view oggi
-- non ha `security_invoker`; status quo preservato, fix dedicato in
-- task separato che richiede prima audit RLS delle 5 sorgenti).
--
-- Definizione base presa verbatim da `pg_get_viewdef` sulla view live
-- in staging, con UNA sola modifica chirurgica al filter di
-- `current_total`.

CREATE OR REPLACE VIEW public.v_tables_with_state AS
 SELECT t.id,
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
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text, 'delivered'::text])) AND o.is_rectification = false) - sum(o.total_amount) FILTER (WHERE (o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text, 'delivered'::text])) AND o.is_rectification = true), 0::numeric) AS current_total,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.bill_requested_at IS NOT NULL) AS bill_requested_count,
    count(DISTINCT o.id) FILTER (WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text])) AS open_orders_count
   FROM tables t
     LEFT JOIN table_zones tz ON tz.id = t.zone_id
     LEFT JOIN customer_sessions cs ON cs.current_table_id = t.id
     LEFT JOIN orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
     LEFT JOIN order_groups og ON og.table_id = t.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, tz.name;

COMMENT ON VIEW public.v_tables_with_state IS
    'Tavoli arricchiti con stato derivato. `pending_orders_count` = '
    'submitted+acknowledged (UI "in cucina"). `open_orders_count` = '
    'submitted+acknowledged+ready (UI "aperti", base per gate di '
    'close-table). `current_total` somma `total_amount` su submitted+'
    'acknowledged+ready+delivered (non-rectification) meno la stessa '
    'coorte di rectification; `cancelled` escluso. Non includere '
    '`delivered` ne'' `cancelled` nei conteggi count.';
