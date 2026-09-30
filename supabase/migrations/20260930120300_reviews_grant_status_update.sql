-- reviews: chi modera cambia solo lo stato.
--
-- Privilegio di colonna: un UPDATE che tocca rating, comment o qualunque altra
-- colonna fallisce con 42501 per tutti i membri, owner compreso. Quali righe
-- restano decise dalla policy "Roles can update reviews"
-- (has_permission('reviews.moderate', activity_id) in USING e WITH CHECK).

GRANT UPDATE (status) ON public.reviews TO authenticated;
