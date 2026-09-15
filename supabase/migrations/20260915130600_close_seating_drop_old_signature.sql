-- =============================================================================
-- DROP close_seating(uuid, text) — cambia firma (7/14)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1. La nuova versione (20260915130700) aggiunge
-- `p_action text DEFAULT NULL`. Lasciare la vecchia firma creerebbe un
-- overload ambiguo per la chiamata a due argomenti della dashboard
-- (`.rpc('close_seating', {p_seating_id, p_reason})`): si droppa prima.
-- Un comando per file (42601 su db push). ACL ricreata in 130800/130900.
--
-- Nessun altro chiamante: `close_stale_seatings` usa `_close_seating_unchecked`.

DROP FUNCTION public.close_seating(uuid, text);
