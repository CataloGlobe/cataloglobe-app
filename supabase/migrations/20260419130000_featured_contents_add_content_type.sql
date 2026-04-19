-- Add content_type to featured_contents.
-- Derived from pricing_mode for existing rows.

ALTER TABLE public.featured_contents
ADD COLUMN content_type TEXT NOT NULL DEFAULT 'announcement'
  CHECK (content_type IN ('announcement', 'event', 'promo', 'bundle'));

-- Backfill from existing pricing_mode values.
-- pricing_mode = 'none'     → 'announcement' (default, already set)
-- pricing_mode = 'per_item' → 'promo'
-- pricing_mode = 'bundle'   → 'bundle'
UPDATE public.featured_contents
SET content_type = CASE
    WHEN pricing_mode = 'per_item' THEN 'promo'
    WHEN pricing_mode = 'bundle'   THEN 'bundle'
    ELSE 'announcement'
END;
