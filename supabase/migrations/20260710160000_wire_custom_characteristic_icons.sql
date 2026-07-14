-- Collega 18 caratteristiche prodotto alle nuove icone custom
-- (13 icone lucide + 5 badge testuali → custom, dopo redesign icone caratteristiche)
-- Le altre 13 caratteristiche custom (organic, raw, coravin, ecc.) non richiedono
-- update: puntavano già a custom:xxx, mancava solo il componente TSX (ora presente).

UPDATE public.product_characteristics SET icon = 'custom:map-pin' WHERE code = 'km_zero';
UPDATE public.product_characteristics SET icon = 'custom:award' WHERE code = 'chef_recommended';
UPDATE public.product_characteristics SET icon = 'custom:wine' WHERE code = 'contains_alcohol';
UPDATE public.product_characteristics SET icon = 'custom:coffee' WHERE code = 'contains_caffeine';
UPDATE public.product_characteristics SET icon = 'custom:clock' WHERE code = 'out_of_stock';
UPDATE public.product_characteristics SET icon = 'custom:sparkles' WHERE code = 'new';
UPDATE public.product_characteristics SET icon = 'custom:trending-up' WHERE code = 'popular';
UPDATE public.product_characteristics SET icon = 'custom:wheat-off' WHERE code = 'gluten_free';
UPDATE public.product_characteristics SET icon = 'custom:milk-off' WHERE code = 'lactose_free';
UPDATE public.product_characteristics SET icon = 'custom:calendar' WHERE code = 'seasonal';
UPDATE public.product_characteristics SET icon = 'custom:sprout' WHERE code = 'vegan';
UPDATE public.product_characteristics SET icon = 'custom:leaf' WHERE code = 'vegetarian';
UPDATE public.product_characteristics SET icon = 'custom:snowflake' WHERE code = 'frozen_ingredients';
UPDATE public.product_characteristics SET icon = 'custom:halal' WHERE code = 'halal';
UPDATE public.product_characteristics SET icon = 'custom:kosher' WHERE code = 'kosher';
UPDATE public.product_characteristics SET icon = 'custom:slow-food' WHERE code = 'slow_food';
UPDATE public.product_characteristics SET icon = 'custom:fivi' WHERE code = 'fivi';
UPDATE public.product_characteristics SET icon = 'custom:18plus' WHERE code = 'adults_only';
