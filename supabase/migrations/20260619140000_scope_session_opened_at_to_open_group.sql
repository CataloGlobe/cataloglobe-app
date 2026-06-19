-- v_tables_with_state: `session_opened_at` legato al CONTO VIVO (open group)
-- invece che a `customer_sessions.first_seen_at`.
--
-- BUG (timer 56h / sessione zombie): `session_opened_at` era
-- `min(cs2.first_seen_at)` sulle sessioni con `expires_at > now()`.
-- `first_seen_at` e' scritto una sola volta all'INSERT e mai aggiornato,
-- mentre `expires_at`/`last_activity_at` vengono rinnovati ad ogni QR scan
-- (resolve-table reuse-by-device) e ordine. Risultato: una sessione tenuta
-- viva da re-scan ravvicinati mostra "Occupato da X" che cresce dal PRIMO
-- scan in assoluto, anche di giorni. Verificato staging San Pietro: T2
-- first_seen 16/06, rinnovata fino al 18/06 -> ~56h.
--
-- FIX: derivare l'occupazione dal primo ordine non annullato del conto
-- aperto, ESATTAMENTE lo stesso insieme di `current_total`
-- (20260619120000): ordini di un `order_groups.status='open'` del tavolo,
-- `cancelled_at IS NULL`. Cosi' timer e saldo sono coerenti per
-- costruzione. `submitted_at` scelto come timestamp ordine: NOT NULL
-- DEFAULT now() (20260519140000_create_orders.sql), sempre valorizzato per
-- gli stati che contano (submitted/acknowledged/ready/delivered).
--
-- Tavolo occupato SENZA ordini nel conto aperto -> min su set vuoto =
-- NULL -> nessun cronometro lato FE (TablesLiveView gating
-- `status==='occupied' && t.session_opened_at`). Comportamento accettato.
-- Ex-zombie (gruppi gia' chiusi) -> niente 56h.
--
-- UNICA DIFFERENZA vs 20260619120000_scope_current_total_to_open_group.sql:
-- il blocco `session_opened_at` (e il COMMENT). `current_total` (JOIN
-- order_groups status='open'), tutte le altre colonne, l'ordine dei campi,
-- FROM/JOIN/WHERE/GROUP BY e la reloption `security_invoker = on` sono
-- riemessi VERBATIM.

CREATE OR REPLACE VIEW public.v_tables_with_state
    WITH (security_invoker = on)
AS
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
    ( SELECT COALESCE(sum(o2.total_amount) FILTER (WHERE (o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text, 'delivered'::text])) AND o2.is_rectification = false), 0::numeric) - COALESCE(sum(o2.total_amount) FILTER (WHERE (o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text, 'delivered'::text])) AND o2.is_rectification = true), 0::numeric)
           FROM orders o2
           JOIN order_groups og2
             ON og2.id = o2.order_group_id
            AND og2.status = 'open'::text
          WHERE o2.table_id = t.id AND o2.cancelled_at IS NULL) AS current_total,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.bill_requested_at IS NOT NULL) AS bill_requested_count,
    count(DISTINCT o.id) FILTER (WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text])) AS open_orders_count,
    ( SELECT COALESCE(
          json_agg(
              json_build_object(
                  'id',           o2.id,
                  'status',       o2.status,
                  'total_amount', o2.total_amount,
                  'submitted_at', o2.submitted_at
              )
              ORDER BY o2.submitted_at
          ),
          '[]'::json
      )
      FROM orders o2
      WHERE o2.table_id = t.id
        AND o2.cancelled_at IS NULL
        AND o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text])
    ) AS active_orders,
    ( SELECT min(o2.submitted_at)
      FROM orders o2
      JOIN order_groups og2
        ON og2.id = o2.order_group_id
       AND og2.status = 'open'::text
      WHERE o2.table_id = t.id
        AND o2.cancelled_at IS NULL
    ) AS session_opened_at,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.waiter_called_at IS NOT NULL) AS waiter_called_count
   FROM tables t
     LEFT JOIN table_zones tz ON tz.id = t.zone_id
     LEFT JOIN customer_sessions cs ON cs.current_table_id = t.id
     LEFT JOIN orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
     LEFT JOIN order_groups og ON og.table_id = t.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, tz.name;

COMMENT ON VIEW public.v_tables_with_state IS
    'Stato live per tavolo: sessioni attive, ordini pendenti, totale corrente, richieste conto, chiamate cameriere. `current_total` e `session_opened_at` scopati all''order_group APERTO del tavolo (conto vivo, stesso insieme: order_groups.status=''open'' + cancelled_at IS NULL). `current_total` = somma submitted+acknowledged+ready+delivered non-rectification meno rectification. `session_opened_at` = min(submitted_at) del primo ordine del conto aperto (NULL se nessun ordine -> nessun timer FE); NON piu'' legato a customer_sessions.first_seen_at (eliminato il timer-zombie da rinnovo expires_at). Security invoker: RLS delle tabelle sottostanti applicata al chiamante.';
