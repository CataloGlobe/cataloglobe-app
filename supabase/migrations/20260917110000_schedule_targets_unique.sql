-- UNIQUE mancante su schedule_targets: nulla impediva righe duplicate
-- (stesso schedule_id + target_type + target_id). Verificato su staging
-- pre-migration: 0 duplicati (query di conteggio in coda a questo file).
-- Senza questo vincolo, countActivityDeleteImpact (src/services/supabase/
-- activities.ts) e il cleanup in delete-business potrebbero, in teoria,
-- contare più righe del previsto per la stessa sede.
ALTER TABLE schedule_targets
    ADD CONSTRAINT schedule_targets_schedule_target_unique
    UNIQUE (schedule_id, target_type, target_id);

-- Query di verifica pre-migration (da rilanciare prima di applicare, se è
-- passato tempo dal controllo fatto in staging):
-- select schedule_id, target_type, target_id, count(*)
-- from schedule_targets
-- group by schedule_id, target_type, target_id
-- having count(*) > 1;
