-- Backfill schedule_targets dal target inline di schedules (target_type/
-- target_id), per le regole senza apply_to_all. La tabella, le policy
-- RESTRICTIVE e l'RPC update_schedule_targets esistono da tempo ma finora
-- nessun caller scriveva qui: il salvataggio scriveva solo le colonne
-- inline. Idempotente: ON CONFLICT DO NOTHING sul UNIQUE
-- schedule_targets_schedule_target_unique (schedule_id, target_type,
-- target_id), già presente su staging e produzione.
INSERT INTO schedule_targets (schedule_id, target_type, target_id)
SELECT s.id, s.target_type, s.target_id
FROM schedules s
WHERE s.apply_to_all IS NOT TRUE
  AND s.target_type IS NOT NULL
  AND s.target_id IS NOT NULL
ON CONFLICT (schedule_id, target_type, target_id) DO NOTHING;

-- Verifica post-apply (commentata, da lanciare a mano dopo il push):
-- regole con target inline che restano senza riga coerente in
-- schedule_targets — deve dare 0.
--
-- select count(*)
-- from schedules s
-- where s.apply_to_all IS NOT TRUE
--   and s.target_type is not null
--   and s.target_id is not null
--   and not exists (
--     select 1 from schedule_targets st
--     where st.schedule_id = s.id
--       and st.target_type = s.target_type
--       and st.target_id = s.target_id
--   );
