-- Change default for show_in_public_channels to true and backfill existing rows.
-- Rationale: catalog attributes (color, size, spice level, etc.) are informational
-- and should be visible by default. Operators can opt-out per attribute via the UI.

ALTER TABLE product_attribute_definitions
    ALTER COLUMN show_in_public_channels SET DEFAULT true;

UPDATE product_attribute_definitions
SET show_in_public_channels = true
WHERE show_in_public_channels = false;
