-- =============================================================================
-- DROP _close_order_group_unchecked(uuid, text) — cambia firma (1/6)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1, correzione. Il cuore ha due ingressi e il motivo di
-- annullamento era cablato a «Chiusura tavolo»: un ordine annullato da
-- «Servizio concluso» finiva nello Storico col motivo di un gesto mai
-- avvenuto. La nuova versione (20260915140200) riceve il motivo dal
-- chiamante. Aggiungere un parametro creerebbe un overload: DROP prima, un
-- comando per file. I chiamanti sono ricreati in 140400..140600.

DROP FUNCTION public._close_order_group_unchecked(uuid, text);
