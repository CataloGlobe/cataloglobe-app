-- ============================================================
-- order_items: cancelled_at / cancel_reason solo via RPC.
--
-- L'annullamento di una riga («Annulla articolo») passa solo da
-- cancel_order_item_atomic (SECURITY DEFINER, owner postgres, EXECUTE solo a
-- service_role, chiamata dall'edge cancel-order-item): toglie la riga dal
-- totale, alza la version e, se non resta niente, annulla l'ordine.
-- Finora chi ha orders.manage poteva anche scrivere le due colonne con un
-- PATCH diretto (policy "Roles can update order_items" + UPDATE di tabella di
-- Supabase): riga annullata senza totale né version aggiornati.
--
-- Un REVOKE UPDATE (colonna) da solo non basta: con l'UPDATE di tabella il
-- privilegio di colonna resta. Quindi: via l'UPDATE di tabella a anon e
-- authenticated, e ad authenticated di nuovo l'UPDATE colonna per colonna su
-- tutte le altre (letto da information_schema, così nessuna colonna si perde).
-- anon non aveva policy UPDATE: non riprende niente.
--
-- Nessun percorso del frontend aggiorna order_items (src/: solo SELECT);
-- le edge scrivono con service_role o via RPC DEFINER, che non cambiano.
-- Una colonna aggiunta in futuro NON è aggiornabile da authenticated finché
-- una migration non la concede: è voluto (oggi nessuno la scriverebbe).
--
-- Test: supabase/tests/order_items_cancel_columns_guard.test.sql (staging).
-- ============================================================

REVOKE UPDATE ON TABLE public.order_items FROM anon, authenticated;

DO $$
DECLARE
    v_columns text;
BEGIN
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
      INTO v_columns
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'order_items'
       AND c.column_name NOT IN ('cancelled_at', 'cancel_reason');

    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.order_items TO authenticated', v_columns);
END
$$;

-- Le due colonne restano escluse anche se un GRANT di colonna fosse già lì.
REVOKE UPDATE (cancelled_at, cancel_reason) ON TABLE public.order_items FROM anon, authenticated;
