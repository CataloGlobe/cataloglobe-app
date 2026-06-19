-- v_tables_with_state: scoping di `current_total` al solo order_group APERTO.
--
-- BUG (saldo fantasma): la sub-query di `current_total` filtrava solo
-- `o2.table_id = t.id AND o2.cancelled_at IS NULL`, sommando i `delivered`
-- di TUTTA la storia del tavolo (tutte le sessioni passate, gruppi gia'
-- chiusi). Il conto non si azzerava mai: dopo "Chiudi tavolo" il prossimo
-- cliente ereditava il saldo dei delivered precedenti. Verificato staging
-- San Pietro: T1 = 166 EUR con 0 ordini in corso (6 delivered in gruppi
-- gia' `closed`), T3 = 112, T5 = 68 anche senza sessione attiva.
--
-- FIX: vincolare la somma agli ordini appartenenti a un `order_groups`
-- con `status = 'open'`. L'order_group e' l'entita'-conto del dominio:
-- nasce all'apertura, fonde piu' sessioni (cliente + sentinel staff) in
-- un'unica bolla, e `close_table_with_resolution` lo chiude (status =
-- 'closed') -> segnale esplicito di "conto chiuso". I delivered restano
-- nel conto finche' il gruppo e' aperto (servito ma non pagato), spariscono
-- alla chiusura. Nuovo ciclo = nuovo open group = saldo riparte da 0.
-- Criterio confermato (vedi audit FASE 1.5): orders.customer_session_id e
-- orders.order_group_id sono entrambi non-NULL in pratica (gli ordini
-- staff hanno una staff-session sentinel + open group via submit_order_atomic).
--
-- UNICA DIFFERENZA vs 20260614120100_extend_v_tables_with_waiter_call.sql:
-- il blocco `current_total` (aggiunto JOIN order_groups og2 ... status =
-- 'open'). Tutte le altre colonne, FROM/JOIN/WHERE/GROUP BY, l'ordine dei
-- campi e la reloption `security_invoker = on` sono riemessi VERBATIM.

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
    ( SELECT min(cs2.first_seen_at)
      FROM customer_sessions cs2
      WHERE cs2.current_table_id = t.id
        AND cs2.expires_at > now()
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
    'Stato live per tavolo: sessioni attive, ordini pendenti, totale corrente, richieste conto, chiamate cameriere. `current_total` scopato all''order_group APERTO del tavolo (conto vivo): somma submitted+acknowledged+ready+delivered non-rectification meno rectification, su ordini in un order_groups.status=''open'', `cancelled` esclusi. I delivered di gruppi chiusi (sessioni passate) NON contano. Security invoker: RLS delle tabelle sottostanti applicata al chiamante.';
