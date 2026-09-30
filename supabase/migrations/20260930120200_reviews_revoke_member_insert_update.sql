-- reviews: authenticated perde INSERT e UPDATE a livello di tabella.
--
-- La policy UPDATE su reviews.moderate resta, ma copriva ogni colonna: chi
-- modera poteva riscrivere voto e commento del cliente. L'UPDATE torna nel
-- file successivo sulla sola colonna status (REVOKE e GRANT in file separati:
-- db push fallisce con 42601 se stanno insieme). INSERT non torna: nessuna
-- policy lo ammette più (20260930120100). DELETE e SELECT invariati.

REVOKE INSERT, UPDATE ON public.reviews FROM authenticated;
