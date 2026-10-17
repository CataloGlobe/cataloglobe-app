-- =============================================================================
-- Multi menù, passo 5: riordino dei menù (M16, passo b di 20261013120200).
-- =============================================================================
--
-- reorder_catalogs(p_tenant_id, p_catalog_ids) riscrive catalogs.sort_order
-- da 1 nell'ordine dato. È l'ordine dei riquadri di «Scegli il menu» e, a pari
-- ora di inizio, di «Più tardi» (scheduleResolver.loadCatalogSortOrders): uno
-- per azienda, uguale in tutte le sedi (deciso da Alex il 2026-10-12).
--
-- L'elenco deve contenere tutti e soli i menù dell'azienda, ognuno una volta:
-- un elenco parziale (pagina vecchia, menù appena creato da un altro) lascerebbe
-- numeri doppi. Altrimenti 22023 e niente cambia.
--
-- Permesso: has_permission_any_activity('catalogs.write'), come
-- import_products_into_catalog. La RLS di catalogs lascerebbe scrivere ogni
-- membro dell'azienda: la funzione è più stretta, non più larga.
--
-- Indietro: DROP FUNCTION public.reorder_catalogs(uuid, uuid[]);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reorder_catalogs(p_tenant_id uuid, p_catalog_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any_activity('catalogs.write', p_tenant_id) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_catalog_ids IS NULL
     OR cardinality(p_catalog_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_catalog_ids) AS x) THEN
    RAISE EXCEPTION 'Elenco dei menù non valido' USING ERRCODE = '22023';
  END IF;

  -- tutti e soli i menù dell'azienda; FOR UPDATE: due riordini insieme vanno in fila
  PERFORM 1 FROM public.catalogs WHERE tenant_id = p_tenant_id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.catalogs WHERE tenant_id = p_tenant_id;
  IF v_count <> cardinality(p_catalog_ids)
     OR EXISTS (
       SELECT 1 FROM unnest(p_catalog_ids) AS x
       WHERE NOT EXISTS (SELECT 1 FROM public.catalogs c WHERE c.id = x AND c.tenant_id = p_tenant_id)
     ) THEN
    RAISE EXCEPTION 'L''elenco non corrisponde ai menù dell''azienda' USING ERRCODE = '22023';
  END IF;

  UPDATE public.catalogs c
  SET sort_order = o.pos
  FROM unnest(p_catalog_ids) WITH ORDINALITY AS o(id, pos)
  WHERE c.id = o.id AND c.tenant_id = p_tenant_id AND c.sort_order IS DISTINCT FROM o.pos;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_catalogs(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_catalogs(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_catalogs(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_catalogs(uuid, uuid[]) IS
  'Multi menù passo 5: riscrive catalogs.sort_order da 1 nell''ordine dato; elenco = tutti i menù dell''azienda. Permesso catalogs.write.';
