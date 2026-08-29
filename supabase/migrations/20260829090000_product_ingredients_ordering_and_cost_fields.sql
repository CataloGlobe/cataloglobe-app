-- =============================================================================
-- product_ingredients: ordinamento esplicito + campi dormienti per il food cost
--
-- 1. `sort_order` — ordine degli ingredienti dentro un prodotto, deciso
--    dall'utente via drag & drop e riprodotto tale e quale sulla pagina
--    pubblica. Prima l'ordine era quello arbitrario restituito dal join.
--
-- 2. `quantity`, `unit` (sul legame) e `ingredients.default_unit` (sull'anagrafica)
--    sono PREDISPOSIZIONE per il futuro modulo food cost. Nessuna UI li scrive,
--    nessuna logica applicativa li legge, non entrano nel payload pubblico ne'
--    nel sistema traduzioni. Devono restare NULL finche' quel modulo non esiste.
-- =============================================================================

-- ── 1. Colonne ───────────────────────────────────────────────────────────────

ALTER TABLE public.product_ingredients
    ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quantity   numeric NULL,
    ADD COLUMN IF NOT EXISTS unit       text    NULL;

ALTER TABLE public.ingredients
    ADD COLUMN IF NOT EXISTS default_unit text NULL;

-- ── 2. Backfill deterministico dei legami esistenti ──────────────────────────
-- 0..n-1 dentro ogni prodotto, per `created_at` crescente. Tie-break su
-- `ingredient_id`: i legami creati dallo stesso `replace_product_ingredients`
-- condividono lo stesso `created_at` (una sola INSERT ... SELECT unnest), quindi
-- senza tie-break `row_number()` non sarebbe riproducibile.

WITH ordered AS (
    SELECT
        product_id,
        ingredient_id,
        row_number() OVER (
            PARTITION BY product_id
            ORDER BY created_at, ingredient_id
        ) - 1 AS rn
    FROM public.product_ingredients
)
UPDATE public.product_ingredients pi
SET sort_order = o.rn
FROM ordered o
WHERE pi.product_id = o.product_id
  AND pi.ingredient_id = o.ingredient_id;

-- ── 3. Indice ────────────────────────────────────────────────────────────────
-- Il pattern di lettura e' sempre "tutti i legami di un prodotto, ordinati":
-- `WHERE product_id = $1 ORDER BY sort_order` nel service, e l'embed PostgREST
-- del resolver (`ingredients:product_ingredients(...)`) che filtra per
-- product_id. L'indice composito serve il filtro E l'ordinamento, evitando il
-- sort in memoria.
--
-- `v2_product_ingredients_product_id_idx` (solo `product_id`) diventa un
-- prefisso ridondante del composito: viene rimosso per non pagarne il
-- mantenimento in scrittura.

CREATE INDEX IF NOT EXISTS product_ingredients_product_id_sort_order_idx
    ON public.product_ingredients (product_id, sort_order);

DROP INDEX IF EXISTS public.v2_product_ingredients_product_id_idx;

-- ── 4. Documentazione delle colonne dormienti ────────────────────────────────

COMMENT ON COLUMN public.product_ingredients.sort_order IS
    'Ordine dell''ingrediente dentro il prodotto (0-based). Scritto da replace_product_ingredients, letto dal resolver cataloghi e dalla pagina pubblica.';

COMMENT ON COLUMN public.product_ingredients.quantity IS
    'DORMIENTE — predisposizione per il futuro modulo food cost. Nessuna UI lo scrive, nessuna logica lo legge, non entra nel payload pubblico. Deve restare NULL finche'' il modulo non esiste.';

COMMENT ON COLUMN public.product_ingredients.unit IS
    'DORMIENTE — unita'' di misura della quantita'' per il futuro modulo food cost. Fuori dal sistema traduzioni per scelta esplicita. Deve restare NULL finche'' il modulo non esiste.';

COMMENT ON COLUMN public.ingredients.default_unit IS
    'DORMIENTE — unita'' di misura predefinita dell''ingrediente, per il futuro modulo food cost. Fuori dal sistema traduzioni per scelta esplicita. Deve restare NULL finche'' il modulo non esiste.';
