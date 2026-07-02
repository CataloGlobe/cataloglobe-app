-- Add the natural aspect ratio of the featured media to featured_contents.
--
-- The public render (2.7c) must reproduce the saved framing WITHOUT measuring
-- the box (SSR-safe, incl. Open Graph scrapers). For zoom != 1 (whole image with
-- bands, or a tighter crop) the pure-CSS math needs the image's natural aspect
-- ratio, so we persist it as a column.
--
-- Design:
--   - Nullable ON PURPOSE: legacy rows stay NULL. At render, NULL -> fallback
--     object-fit: cover (already the correct framing for zoom = 1). No backfill
--     required.
--   - Value = naturalWidth / naturalHeight of the ORIGINAL image (pre-compression),
--     computed in the drawer at persistence time (2.7b) via compressImageWithMeta.
--   - Only ADD COLUMN — no RLS policy touched.

ALTER TABLE featured_contents
  ADD COLUMN media_aspect_ratio real
    CHECK (media_aspect_ratio IS NULL OR media_aspect_ratio > 0);
