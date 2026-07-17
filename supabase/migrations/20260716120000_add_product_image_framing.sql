-- Add image framing metadata to products (FASE 8b — product image reframe).
--
-- Approccio "framing metadata + FramedMedia" (NON baked): l'immagine prodotto
-- e' mostrata in aspect ratio diversi per contesto (List 1:1, Grid 4:3,
-- ItemDetail/admin 16:9). Un focal point + zoom salvati come metadata vengono
-- riapplicati per-contenitore da FramedMedia, a differenza di Logo/Cover/Avatar/
-- Gallery/Story-cover che salvano un file gia' ritagliato (baked).
--
-- Non distruttivo: `image_url` invariato. Entrambe le colonne NULLABLE:
--   - image_framing NULL      → il read path applica PRODUCT_IMAGE_DEFAULT_FRAMING
--                               (center 0.5/0.5, zoom 1, fill blur).
--   - image_aspect_ratio NULL → FramedMedia usa il path legacy cover
--                               (object-position), identico all'odierno object-fit
--                               cover → ZERO regressione sui 24 prodotti gia' con
--                               immagine ma senza framing.
-- Copre padre + varianti: le varianti sono righe della stessa tabella `products`
-- (parent_product_id self-ref), ognuna con la propria immagine e il proprio framing.
-- Solo ADD COLUMN — nessuna RLS policy toccata.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_framing jsonb
    CHECK (image_framing IS NULL OR jsonb_typeof(image_framing) = 'object'),
  ADD COLUMN IF NOT EXISTS image_aspect_ratio real
    CHECK (image_aspect_ratio IS NULL OR image_aspect_ratio > 0);

COMMENT ON COLUMN products.image_framing IS
  'MediaFraming { focalX, focalY, zoom, fillMode, fillColor } per il reframe dell''immagine prodotto. NULL = default (center/cover/blur) applicato dal frontend.';
COMMENT ON COLUMN products.image_aspect_ratio IS
  'Aspect ratio naturale (w/h) dell''immagine sorgente, per il render parametrico di FramedMedia a ratio diversi. Mirror di featured_contents.media_aspect_ratio. NULL = legacy cover path.';
