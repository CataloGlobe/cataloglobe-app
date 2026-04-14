-- Rimuovi slot "hero" dai featured contents.
-- Tutti i record hero esistenti vengono convertiti in before_catalog.
-- Restano solo due slot: before_catalog e after_catalog.

-- 1. Converti record esistenti
UPDATE schedule_featured_contents
SET slot = 'before_catalog'
WHERE slot = 'hero';

-- 2. Aggiorna constraint per impedire nuovi inserimenti hero
ALTER TABLE schedule_featured_contents
  DROP CONSTRAINT IF EXISTS schedule_featured_contents_slot_check;

ALTER TABLE schedule_featured_contents
  ADD CONSTRAINT schedule_featured_contents_slot_check
  CHECK (slot IN ('before_catalog', 'after_catalog'));
