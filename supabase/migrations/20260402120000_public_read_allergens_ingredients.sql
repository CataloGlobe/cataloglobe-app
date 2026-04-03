-- Public read: product_allergens
-- Necessario per resolveActivityCatalogs (utente anonimo)
CREATE POLICY "Public can read product_allergens"
ON public.product_allergens
FOR SELECT
TO anon
USING (true);

-- Public read: product_ingredients
CREATE POLICY "Public can read product_ingredients"
ON public.product_ingredients
FOR SELECT
TO anon
USING (true);

-- Public read: ingredients
-- Solo lettura nomi — nessun dato sensibile
CREATE POLICY "Public can read ingredients"
ON public.ingredients
FOR SELECT
TO anon
USING (true);
