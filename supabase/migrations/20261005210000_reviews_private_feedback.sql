-- reviews: feedback privato del locale (R1).
--
-- Le recensioni interne non compaiono più da nessuna parte pubblica e non si
-- moderano: niente coda, niente Pubblica / Tieni nascosta. La colonna `status`
-- resta (default 'pending'), non letta né scritta da nessuno.
--
-- 1. reviews_select_anon: già tolta da 20260930120000 (#155). Ripetuta con
--    IF EXISTS così l'ambiente che non l'avesse ancora applicata si allinea.
-- 2. anon: via ogni privilegio di tabella. Senza policy la RLS negava già
--    tutto; i GRANT di default restavano, ora anche quelli no. Nessun
--    lettore o scrittore anon: submit-review inserisce col service role.
-- 3. Cambio di stato: tolta la policy UPDATE (reviews.moderate) e il
--    privilegio UPDATE (status) dato ad authenticated da 20260930120300.
--    Era l'unico UPDATE ammesso (reviews.respond tolto in 20260918134400);
--    il frontend non aggiorna più le recensioni.
--
-- Restano: SELECT con reviews.read, DELETE con reviews.delete (owner, admin).
-- Il permesso reviews.moderate resta nella tabella permissions, inutilizzato.

DROP POLICY IF EXISTS reviews_select_anon ON public.reviews;

REVOKE ALL ON public.reviews FROM anon;

DROP POLICY IF EXISTS "Roles can update reviews" ON public.reviews;

REVOKE UPDATE (status) ON public.reviews FROM authenticated;
