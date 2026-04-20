-- Fix: reset max_selectable = 1 on ADDON groups to NULL (no limit).
-- ADDON groups do not default to 1; that value was only correct for PRIMARY_PRICE groups.
UPDATE product_option_groups
SET max_selectable = NULL
WHERE group_kind = 'ADDON'
  AND max_selectable = 1;
