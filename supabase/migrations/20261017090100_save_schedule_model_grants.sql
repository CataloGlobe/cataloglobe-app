-- =============================================================================
-- Privilegi di 20261017090000 (separati: CREATE FUNCTION e GRANT nello stesso
-- file fanno fallire db push, 42601). create_schedule_with_targets tiene i
-- privilegi che aveva (CREATE OR REPLACE non li tocca).
-- =============================================================================

REVOKE ALL ON FUNCTION public.save_schedule_model(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_schedule_model(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_schedule_model(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_schedule_model(uuid, jsonb) IS
  'Multi menù: salva menù o stile, overlap_mode e fasce di una regola menu/style in un colpo; scrive le colonne di oggi dalla prima fascia (ponte girato).';
