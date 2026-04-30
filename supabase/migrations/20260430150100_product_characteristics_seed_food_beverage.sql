-- =============================================================================
-- Seed: product_characteristics — food_beverage v1.0
-- =============================================================================
--
-- 31 voci totali su 6 categorie (input prompt indicava 34 — discrepanza nel
-- conteggio originale, le voci elencate nominalmente sono 31).
--
--   diet:        8  (vegetarian, vegan, gluten_free, lactose_free,
--                    halal, kosher, organic, raw)
--   spicy:       3  (mutex_group='spicy': mild, medium, hot)
--   origin:      5  (km_zero, slow_food, fivi, coravin, sustainable_fishing)
--   preparation: 4  (frozen_ingredients, blast_chilled, homemade, seasonal)
--   warning:     6  (contains_garlic/onion/pork/alcohol/caffeine, adults_only)
--   status:      5  (chef_recommended, new, signature_dish, popular,
--                    out_of_stock)
--
-- sort_order: numerazione a step di 10 dentro la categoria, gap inter-categoria
-- (100/200/300/...) per inserzioni future senza renumber.
--
-- icon prefix: 3 valori distinti (D5):
--   lucide:* → componente da lucide-react
--   custom:* → SVG locale in src/components/icons/characteristics/
--   badge:*  → componente React badge testuale parametrizzato (Halal,
--              Kosher, Slow Food, FIVI, 18+) — marchi/sigle culturali senza
--              equivalente Lucide. Render testuale evita imitazione logo.
--
-- Note inline su semantica (D6, D7, D8):
--   * out_of_stock: claim TEMPORANEO del ristoratore "in riassortimento".
--     Distinto da products.is_disabled (cancellazione) e da
--     schedule_visibility_overrides (scheduling). Rendering CTA disable
--     atteso in Fase 5.
--   * contains_garlic/onion/pork: claim espliciti per intolleranze e
--     restrizioni religiose/etiche. Distinti da product_ingredients (testo
--     libero) — qui sono filtrabili e iconografabili.
--   * dietary_claim=true: future-proof per claim con responsabilità legale
--     (oggi coincide con category='diet', ma valore distinto per estensioni).
--
-- Refs: DESIGN_product_characteristics.md sez. 7.
-- =============================================================================

BEGIN;

INSERT INTO public.product_characteristics
    (code, category, vertical, label_it, label_en, icon, sort_order, show_in_card, mutex_group, dietary_claim)
VALUES
    -- ── diet (8) ────────────────────────────────────────────────────────────
    ('vegetarian',          'diet',        'food_beverage', 'Vegetariano',         'Vegetarian',                    'lucide:leaf',         10, true,  NULL,    true),
    ('vegan',               'diet',        'food_beverage', 'Vegano',              'Vegan',                         'lucide:sprout',       20, true,  NULL,    true),
    ('gluten_free',         'diet',        'food_beverage', 'Senza glutine',       'Gluten-free',                   'lucide:wheat-off',    30, true,  NULL,    true),
    ('lactose_free',        'diet',        'food_beverage', 'Senza lattosio',      'Lactose-free',                  'lucide:milk-off',     40, true,  NULL,    true),
    ('halal',               'diet',        'food_beverage', 'Halal',               'Halal',                         'badge:halal',         50, true,  NULL,    true),
    ('kosher',              'diet',        'food_beverage', 'Kosher',              'Kosher',                        'badge:kosher',        60, true,  NULL,    true),
    ('organic',             'diet',        'food_beverage', 'Biologico',           'Organic',                       'custom:organic-leaf', 70, true,  NULL,    true),
    ('raw',                 'diet',        'food_beverage', 'Crudo',               'Raw',                           'custom:raw-fish',     80, false, NULL,    false),

    -- ── spicy (3, mutex_group='spicy') ──────────────────────────────────────
    ('spicy_mild',          'spicy',       'food_beverage', 'Poco piccante',       'Mild',                          'custom:pepper-1',    100, true,  'spicy', false),
    ('spicy_medium',        'spicy',       'food_beverage', 'Medio piccante',      'Medium spicy',                  'custom:pepper-2',    110, true,  'spicy', false),
    ('spicy_hot',           'spicy',       'food_beverage', 'Molto piccante',      'Hot',                           'custom:pepper-3',    120, true,  'spicy', false),

    -- ── origin (5) ──────────────────────────────────────────────────────────
    ('km_zero',             'origin',      'food_beverage', 'Chilometro 0',        'Local (km 0)',                  'lucide:map-pin',     200, true,  NULL,    false),
    ('slow_food',           'origin',      'food_beverage', 'Slow Food',           'Slow Food',                     'badge:slow-food',    210, false, NULL,    false),
    ('fivi',                'origin',      'food_beverage', 'Vignaioli FIVI',      'FIVI Winemakers',               'badge:fivi',         220, false, NULL,    false),
    ('coravin',             'origin',      'food_beverage', 'Vino Coravin',        'Coravin Wine',                  'custom:coravin-drop', 230, false, NULL,    false),
    ('sustainable_fishing', 'origin',      'food_beverage', 'Pesca sostenibile',   'Sustainable fishing',           'custom:fish-leaf',   240, false, NULL,    false),

    -- ── preparation (4) ─────────────────────────────────────────────────────
    ('frozen_ingredients',  'preparation', 'food_beverage', 'Può contenere ingredienti surgelati', 'May contain frozen ingredients', 'lucide:snowflake', 300, false, NULL, false),
    ('blast_chilled',       'preparation', 'food_beverage', 'Prodotto abbattuto',  'Blast chilled',                 'custom:thermometer-snow', 310, false, NULL, false),
    ('homemade',            'preparation', 'food_beverage', 'Fatto in casa',       'Homemade',                      'custom:rolling-pin', 320, false, NULL,    false),
    ('seasonal',            'preparation', 'food_beverage', 'Stagionale',          'Seasonal',                      'lucide:calendar',    330, false, NULL,    false),

    -- ── warning (6) ─────────────────────────────────────────────────────────
    ('contains_garlic',     'warning',     'food_beverage', 'Contiene aglio',      'Contains garlic',               'custom:garlic',      400, false, NULL,    false),
    ('contains_onion',      'warning',     'food_beverage', 'Contiene cipolla',    'Contains onion',                'custom:onion',       410, false, NULL,    false),
    ('contains_pork',       'warning',     'food_beverage', 'Contiene maiale',     'Contains pork',                 'custom:pig',         420, false, NULL,    false),
    ('contains_alcohol',    'warning',     'food_beverage', 'Contiene alcol',      'Contains alcohol',              'lucide:wine',        430, true,  NULL,    false),
    ('adults_only',         'warning',     'food_beverage', 'Solo adulti (18+)',   'Adults only (18+)',             'badge:18plus',       440, true,  NULL,    false),
    ('contains_caffeine',   'warning',     'food_beverage', 'Contiene caffeina',   'Contains caffeine',             'lucide:coffee',      450, false, NULL,    false),

    -- ── status (5) ──────────────────────────────────────────────────────────
    ('chef_recommended',    'status',      'food_beverage', 'Consigliato dallo chef', 'Chef''s recommendation',     'lucide:award',       500, true,  NULL,    false),
    ('new',                 'status',      'food_beverage', 'Nuovo',               'New',                           'lucide:sparkles',    510, true,  NULL,    false),
    ('signature_dish',      'status',      'food_beverage', 'Piatto signature',    'Signature dish',                'custom:signature',   520, true,  NULL,    false),
    ('popular',             'status',      'food_beverage', 'Più richiesto',       'Most popular',                  'lucide:trending-up', 530, false, NULL,    false),
    ('out_of_stock',        'status',      'food_beverage', 'In riassortimento',   'Out of stock',                  'lucide:clock',       540, true,  NULL,    false)
ON CONFLICT (code, vertical) DO NOTHING;

COMMIT;
