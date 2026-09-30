-- reviews: i membri non inseriscono recensioni.
--
-- "Roles can insert reviews" ammetteva l'INSERT a chi ha reviews.moderate
-- (owner, admin, manager, staff): via PostgREST uno staff poteva scrivere una
-- recensione a nome di un cliente, anche già approvata. Nessun client la
-- usa: le recensioni arrivano solo dalla Edge submit-review (service role,
-- fuori dalla RLS). Il privilegio INSERT si toglie nel file successivo.

DROP POLICY IF EXISTS "Roles can insert reviews" ON public.reviews;
