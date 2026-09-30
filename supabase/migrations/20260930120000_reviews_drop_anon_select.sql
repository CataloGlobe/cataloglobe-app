-- reviews: anon non legge più la tabella.
--
-- reviews_select_anon (20260413085957) ammetteva a anon ogni colonna delle
-- recensioni approvate, request_ip e session_id compresi: con la chiave
-- pubblica chiunque leggeva l'IP di chi aveva lasciato una recensione, e ogni
-- «Pubblica» della coda di moderazione ne avrebbe esposto uno in più.
--
-- Nessun lettore anon: la pagina pubblica ha solo il modulo (ReviewsView →
-- Edge submit-review, service role), nessuna view, funzione o trigger dipende
-- dalla tabella (verificato su staging il 30/09/2026). Senza policy per anon
-- la RLS nega ogni riga. Quando le recensioni appariranno sulla pagina
-- pubblica passeranno da un resolver che sceglie le colonne, non da qui.

DROP POLICY IF EXISTS reviews_select_anon ON public.reviews;
