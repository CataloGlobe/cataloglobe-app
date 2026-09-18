-- Rimuove le righe schedule_targets su regole apply_to_all=true: residuo di
-- prima dell'hardening 20260528210000 su update_schedule_targets (l'RPC
-- rifiuta apply_to_all=true per design — 22023 — quindi una riga così non
-- può essere stata scritta da un utente tramite pannello). Una riga di
-- questo tipo è incoerente: la regola significa "tutte le sedi", non una
-- sede specifica.
--
-- Necessaria prima del passo 3 (le letture si spostano da schedules a
-- schedule_targets): senza questa pulizia, una riga così diventerebbe un
-- target EFFETTIVO su una regola che non ne ha e non ne può avere — su
-- staging, 1 riga su una regola apply_to_all creata il 28/05 (il giorno
-- stesso dell'hardening, target inline null).
--
-- Cosa NON fa: le regole con più righe in schedule_targets che includono
-- anche il target inline della regola sono multi-target legittime (salvate
-- da update_schedule_targets dal commit e7786243, o preesistenti con lo
-- stesso pattern — su staging 2 regole, create 18/04 e 19/04) e non vengono
-- toccate. Al passo 3 queste due regole passeranno da una a due sedi
-- effettive: è un ripristino di dati che il vecchio salvataggio scartava
-- silenziosamente, da comunicare quando si fa il passo 3 — non una pulizia.

DELETE FROM schedule_targets st
USING schedules s
WHERE s.id = st.schedule_id
  AND s.apply_to_all IS TRUE;

-- Verifica post-apply (commentata, da lanciare a mano dopo il push):
-- deve dare 0.
--
-- select count(*)
-- from schedule_targets st
-- join schedules s on s.id = st.schedule_id
-- where s.apply_to_all is true;
