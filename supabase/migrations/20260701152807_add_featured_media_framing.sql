-- Add image framing parameters to featured_contents.
-- Non-destructive: original media file untouched; framing stored as parameters.
-- NOT NULL DEFAULTs backfill existing rows to current behavior (centered cover, no-op).
-- media_fill_color nullable: populated only when media_fill_mode = 'color'.
-- Only ADD COLUMN — no RLS policy touched.

ALTER TABLE featured_contents
  ADD COLUMN media_focal_x real NOT NULL DEFAULT 0.5
    CHECK (media_focal_x >= 0 AND media_focal_x <= 1),
  ADD COLUMN media_focal_y real NOT NULL DEFAULT 0.5
    CHECK (media_focal_y >= 0 AND media_focal_y <= 1),
  ADD COLUMN media_zoom real NOT NULL DEFAULT 1
    CHECK (media_zoom > 0),
  ADD COLUMN media_fill_mode text NOT NULL DEFAULT 'blur'
    CHECK (media_fill_mode IN ('blur', 'dominant', 'color', 'none')),
  ADD COLUMN media_fill_color text
    CHECK (media_fill_color IS NULL OR media_fill_color ~ '^#[0-9a-fA-F]{6}$');
