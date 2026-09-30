-- Stories: la sede di una storia appartiene alla stessa azienda della storia.
--
-- Problema: stories.activity_id ha una FK semplice verso activities(id). Le
-- policy di insert/update guardano solo stories.tenant_id, quindi chi scrive
-- storie nella propria azienda può legarne una alla sede di un'altra azienda
-- (activity_id è un uuid qualunque che esiste).
--
-- Soluzione: FK composta (activity_id, tenant_id) → activities(id, tenant_id).
-- Serve un vincolo UNIQUE (id, tenant_id) su activities come bersaglio della
-- FK (id è già PK, il vincolo non restringe nulla). MATCH SIMPLE: con
-- activity_id NULL (storia di brand) la FK non si applica.
--
-- ON DELETE CASCADE come la FK che sostituisce. ON UPDATE NO ACTION: spostare
-- una sede in un'altra azienda con storie legate viene rifiutato.
--
-- Stato al 2026-09-28 su staging: 0 storie con activity_id valorizzato,
-- nessuna riga da correggere. Verificare lo stesso su produzione prima del
-- push (query nella PR).

ALTER TABLE public.activities
  ADD CONSTRAINT activities_id_tenant_id_key UNIQUE (id, tenant_id);

ALTER TABLE public.stories
  DROP CONSTRAINT IF EXISTS stories_activity_id_fkey;

ALTER TABLE public.stories
  ADD CONSTRAINT stories_activity_id_tenant_id_fkey
  FOREIGN KEY (activity_id, tenant_id)
  REFERENCES public.activities (id, tenant_id)
  ON DELETE CASCADE;
