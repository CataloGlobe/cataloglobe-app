-- =============================================================================
-- assign_sunmi_shop_id(p_activity_id) — assegnazione lazy e race-safe di
-- activities.sunmi_shop_id.
-- =============================================================================
--
-- Da supabase-js (PostgREST) non si puo' invocare `nextval()` direttamente:
-- serve una funzione. L'UPDATE condizionale `WHERE sunmi_shop_id IS NULL`
-- prende il row lock sulla sede, quindi due binding concorrenti sulla stessa
-- sede non possono consumare due id: il secondo vede la riga gia' valorizzata
-- e ricade sulla SELECT finale.
--
-- Ritorna sempre lo shop_id corrente della sede (nuovo o preesistente).
-- Solleva eccezione se la sede non esiste.
--
-- SECURITY DEFINER: chiamata SOLO con service_role dall'edge function
-- `sunmi-bind-printer` (che ha gia' verificato has_permission('tables.manage')
-- con il JWT dell'utente). I grant sono nel file successivo (split per la
-- regola 42601 di `supabase db push`, vedi docs/patterns/storage-sql.md).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assign_sunmi_shop_id(p_activity_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_shop_id bigint;
BEGIN
    UPDATE public.activities a
       SET sunmi_shop_id = nextval('public.activities_sunmi_shop_id_seq')
     WHERE a.id = p_activity_id
       AND a.sunmi_shop_id IS NULL
    RETURNING a.sunmi_shop_id INTO v_shop_id;

    IF v_shop_id IS NOT NULL THEN
        RETURN v_shop_id;
    END IF;

    SELECT a.sunmi_shop_id
      INTO v_shop_id
      FROM public.activities a
     WHERE a.id = p_activity_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACTIVITY_NOT_FOUND: %', p_activity_id;
    END IF;

    RETURN v_shop_id;
END;
$$;
