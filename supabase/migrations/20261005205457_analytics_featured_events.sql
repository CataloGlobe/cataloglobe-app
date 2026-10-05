-- Eventi In evidenza della pagina pubblica:
-- - `featured_see_all_click` (nuovo): «Vedi tutti» sui caroselli (metadata: slot, count);
-- - `featured_cta_click`: il frontend lo manda dal carosello, ma non è mai
--   entrato nel vincolo né nell'allowlist dell'edge: finora ogni clic andava perso.
-- Stesso elenco del vincolo originale (20260414150000) più i due valori,
-- letto dal live su staging. NOT VALID + VALIDATE: niente lock lungo sulla
-- tabella eventi mentre si controllano le righe esistenti.
-- Ordine di rilascio: prima questa migration, poi `log-analytics-event`
-- (che accetta i nuovi tipi): al contrario l'insert fallirebbe sul CHECK.

ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS valid_event_type;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT valid_event_type CHECK (event_type IN (
    'page_view',
    'product_detail_open',
    'selection_add',
    'selection_remove',
    'selection_sheet_open',
    'featured_click',
    'featured_cta_click',
    'featured_see_all_click',
    'social_click',
    'search_performed',
    'tab_switch',
    'section_view',
    'review_submitted',
    'review_google_redirect'
  )) NOT VALID;

ALTER TABLE public.analytics_events
  VALIDATE CONSTRAINT valid_event_type;
