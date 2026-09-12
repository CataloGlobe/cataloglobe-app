-- =========================================
-- ORDER_GROUPS — colonna seating_id (sola aggiunta, nessun cambio di comportamento)
-- =========================================
-- `order_groups` diventera' il conto *di una tavolata*. In questa fase prende
-- solo la colonna: NULL per tutte le righe esistenti, e per ora nessuno la
-- scrive. Il comportamento attuale non cambia di una virgola.
--
-- `table_id` resta NOT NULL e NON si tocca qui. Il conto continua ad appoggiarsi
-- al tavolo finche' non esiste il codice che apre le tavolate; togliere il
-- vincolo prima significherebbe permettere righe orfane in una finestra in cui
-- nulla sa ancora ripararle.
--
-- ON DELETE SET NULL, non CASCADE: cancellare una tavolata non deve cancellare
-- il conto. I soldi incassati sopravvivono all'entita' di sala che li ha
-- raccolti.
--
-- Nessun backfill: le righe storiche non hanno una tavolata da cui derivare, e
-- inventarne una a posteriori sarebbe un dato falso, non un dato mancante.

BEGIN;

ALTER TABLE public.order_groups
  ADD COLUMN IF NOT EXISTS seating_id uuid NULL
  REFERENCES public.seatings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.order_groups.seating_id IS
  'Tavolata a cui appartiene il conto. NULL su tutto lo storico e finche'' il codice delle tavolate non e'' attivo.';

CREATE INDEX IF NOT EXISTS idx_order_groups_seating_id
  ON public.order_groups (seating_id);

COMMIT;
