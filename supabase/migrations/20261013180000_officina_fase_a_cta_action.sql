-- =============================================================================
-- Officina, fase (a): il pulsante controllato dell'in evidenza (M11 del
-- pacchetto database, nel brain). Sopra cta_action della #450.
--
-- Valori nuovi: 'none', 'add_to_order', 'show_products'. 'link' resta finché
-- l'editor scrive ancora i link: si toglie nella fase (b), insieme all'editor
-- (scelta 5, deciso da Lorenzo il 2026-10-13). Il valore di partenza passa a
-- 'none': un contenuto nuovo nasce senza pulsante scelto. Le righe di oggi
-- restano com'erano ('link' o 'reservation').
--
-- 'add_to_order' solo col prezzo unico (pricing_mode = 'bundle', deciso da
-- Alex il 2026-10-12): stessa riga, quindi un CHECK. 'show_products' vuole
-- almeno un piatto collegato: è un'altra tabella, il controllo sta nel
-- salvataggio (fase b), non qui.
--
-- Nessun lettore nuovo: la pagina pubblica mostra un link per ogni valore
-- diverso da 'reservation' solo se cta_url è un indirizzo http(s) sicuro,
-- quindi niente cambia. La RPC get_schedule_featured_contents restituisce già
-- cta_action (#450). Rieseguibile.
-- =============================================================================

ALTER TABLE public.featured_contents
  DROP CONSTRAINT IF EXISTS featured_contents_cta_action_check;

ALTER TABLE public.featured_contents
  ADD CONSTRAINT featured_contents_cta_action_check
  CHECK (cta_action IN ('none', 'link', 'reservation', 'add_to_order', 'show_products'));

ALTER TABLE public.featured_contents
  DROP CONSTRAINT IF EXISTS featured_contents_cta_add_to_order_bundle_check;

ALTER TABLE public.featured_contents
  ADD CONSTRAINT featured_contents_cta_add_to_order_bundle_check
  CHECK (cta_action <> 'add_to_order' OR pricing_mode = 'bundle');

ALTER TABLE public.featured_contents
  ALTER COLUMN cta_action SET DEFAULT 'none';
