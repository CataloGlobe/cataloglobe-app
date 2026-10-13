-- =============================================================================
-- Officina, fase (a): ordine dei menù (M16). Nessuno lo legge ancora.
-- =============================================================================
--
-- Un ordine solo per azienda, uguale in tutte le sedi (deciso da Alex il
-- 2026-10-12): servirà ai riquadri della «Scegli il menu» e, a pari ora di
-- inizio, a «Più tardi» (deciso da Lorenzo il 2026-10-13).
--
-- Riempimento: l'ordine che la pagina Menù mostra oggi (services/supabase/
-- catalogs.ts, created_at decrescente), 1, 2, 3… per azienda, a pari data id.
-- Menù nuovo o duplicato: va in cima (confermato da Alex il 2026-10-12). Lo fa
-- il trigger quando chi inserisce non dà un numero: il più piccolo dell'azienda
-- meno uno (anche 0 o negativo). Il riordino della pagina Menù (RPC
-- reorder_catalogs, passo b) riscrive i numeri da 1.
--
-- Niente UNIQUE su (tenant_id, sort_order): durante il riordino due menù hanno
-- per un attimo lo stesso numero, e due inserimenti insieme possono averlo.
--
-- La funzione del trigger non si chiama da fuori (Postgres rifiuta una
-- funzione trigger chiamata come funzione normale): niente GRANT o REVOKE, e
-- quindi niente 42601 di db push.
--
-- Indietro: DROP TRIGGER trg_catalogs_sort_order ON public.catalogs;
--           DROP FUNCTION public.catalogs_set_sort_order();
--           ALTER TABLE public.catalogs DROP COLUMN sort_order;
-- =============================================================================

ALTER TABLE public.catalogs ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE public.catalogs c
   SET sort_order = o.n
  FROM (
    SELECT id,
           row_number() OVER (PARTITION BY tenant_id
                              ORDER BY created_at DESC, id) AS n
      FROM public.catalogs
  ) o
 WHERE o.id = c.id
   AND c.sort_order IS NULL;

CREATE OR REPLACE FUNCTION public.catalogs_set_sort_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT coalesce(min(c.sort_order), 1) - 1
      INTO NEW.sort_order
      FROM public.catalogs c
     WHERE c.tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_catalogs_sort_order ON public.catalogs;
CREATE TRIGGER trg_catalogs_sort_order
  BEFORE INSERT ON public.catalogs
  FOR EACH ROW EXECUTE FUNCTION public.catalogs_set_sort_order();

ALTER TABLE public.catalogs ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS catalogs_tenant_sort_order_idx
  ON public.catalogs (tenant_id, sort_order);
