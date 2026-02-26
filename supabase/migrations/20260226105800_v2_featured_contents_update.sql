begin;

-- =========================================
-- V2: FEATURED CONTENTS UPDATE
-- =========================================

-- Aggiungo le nuove colonne
alter table public.v2_featured_contents
  add column internal_name text not null default 'Nuovo contenuto',
  add column cta_text text null,
  add column cta_url text null,
  add column status text not null default 'draft' check (status in ('draft', 'published')),
  add column layout_style text null,
  add column pricing_mode text not null default 'none' check (pricing_mode in ('none', 'per_item', 'bundle')),
  add column bundle_price numeric null,
  add column show_original_total boolean not null default false;

-- Rinomino cover_image_url in media_id (per matchare specifiche)
alter table public.v2_featured_contents
  rename column cover_image_url to media_id;

-- Migrazione dei dati esistenti per i campi aggiunti (se ci sono)
update public.v2_featured_contents
  set status = case when is_active then 'published' else 'draft' end,
      internal_name = title,
      pricing_mode = case when type = 'composite' then 'per_item' else 'none' end;

-- Rimuovo la default per safety sulle nuove row future per internal_name
alter table public.v2_featured_contents
  alter column internal_name drop default;

-- Elimino le vecchie colonne non più adatte
alter table public.v2_featured_contents
  drop column type,
  drop column is_active;

commit;
