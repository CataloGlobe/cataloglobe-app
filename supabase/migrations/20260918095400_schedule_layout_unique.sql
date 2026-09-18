-- UNIQUE mancante su schedule_layout(schedule_id): nulla impediva più righe
-- schedule_layout per la stessa regola. Il resolver (scheduleResolver.ts,
-- FE + gemello Edge) legge il layout con normalizeOne(row.layout), che
-- prende l'elemento [0] di una relazione a molti risolta da una query NON
-- ordinata — con due righe la scelta del catalogo/stile per quella regola
-- diventa non deterministica (dipende dall'ordine di ritorno di Postgres,
-- non garantito stabile fra due esecuzioni).
--
-- Verificato pre-migration: 0 duplicati (staging 21/21 schedule_id distinti
-- su 21 righe, riconfermato qui sotto; produzione 11/11 secondo verifica
-- riportata dall'utente, non ripetuta da questa sessione — nessun accesso
-- MCP al progetto di produzione).
ALTER TABLE schedule_layout
    ADD CONSTRAINT schedule_layout_schedule_id_unique
    UNIQUE (schedule_id);

-- Query di verifica pre-migration (da rilanciare prima di applicare, se è
-- passato tempo dal controllo fatto sopra):
-- select schedule_id, count(*)
-- from schedule_layout
-- group by schedule_id
-- having count(*) > 1;
