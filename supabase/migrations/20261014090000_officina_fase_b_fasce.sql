-- =============================================================================
-- Officina, fase (b) passo 1: le fasce si riempiono dalle colonne di oggi (M1),
-- e un ponte le tiene allineate finché il back office scrive solo quelle.
-- =============================================================================
--
-- Pacchetto database dell'Officina (brain: wiki/prodotto/officina-pacchetto-
-- database.md, M1 e M2), piano 9b passo 1. Ponte deciso da Lorenzo il
-- 2026-10-14 (D80): il giudice nuovo leggerà le fasce prima che il back office
-- le scriva, quindi ogni regola creata o modificata nel frattempo deve averle.
--
-- Nessuno legge ancora schedule_slots: il cliente non vede niente. Le colonne
-- di oggi (time_mode, days_of_week, time_from, time_to) restano piene e restano
-- la fonte: le fasce sono una copia.
--
-- Da colonne di oggi a fasce, uguale al giudice di oggi
-- (_shared/scheduleCompetition.ts, isTimeRuleActiveNow):
--   - «Sempre»: giorni e orari ignorati, nessuna fascia (regola senza fasce =
--     tutto il giorno, ogni giorno). Anche con days_of_week pieno, perché oggi
--     il giudice li ignora: le «sempre» coi giorni restano un controllo da
--     fare in produzione prima del passo 3, non si correggono qui.
--   - «Fascia» senza una delle due ore: tutto il giorno nei giorni scelti, cioè
--     una fascia 0-1440 coi giorni; senza giorni (NULL) nessuna fascia.
--   - «Fascia» con le ore: una fascia coi giorni copiati, minuti da ora e
--     minuto (i secondi si ignorano, come oggi). Fine 23:59 = 1440: il
--     Calendario scrive 23:59 quando vuol dire mezzanotte (calendarDraft.ts,
--     hm), quindi la fascia guadagna l'ultimo minuto del giorno.
--   - Fine non dopo l'inizio (oggi mai attiva): fascia con days_of_week vuoto,
--     cioè mai, come oggi. Non si legge come «oltre mezzanotte»: lo diventerà
--     solo una regola salvata col modello nuovo.
--   - days_of_week vuoto ({} = mai) si copia così.
-- Periodo (start_at, end_at) e il caso «fascia con inizio e senza fine» restano
-- sulla regola: li guarda il giudice, non le fasce.
-- schedule_slot_targets resta vuota: oggi ogni regola vale per tutte le sue sedi.
--
-- Il ponte: AFTER INSERT o UPDATE delle quattro colonne su schedules, cancella
-- le fasce della regola e riscrive quella unica. SECURITY DEFINER perché la
-- policy «Roles can insert schedules» lascia al manager inserire una regola
-- ancora senza sedi, e in quel momento can_write_schedule (che le RLS di
-- schedule_slots chiedono) risponde no: con l'RLS il suo inserimento
-- fallirebbe, cosa che oggi non succede. Scrive solo le fasce
-- della riga appena scritta, con il suo tenant_id: niente che chi scrive non
-- potesse già fare. Funzione trigger: Postgres rifiuta di chiamarla da fuori,
-- quindi niente GRANT o REVOKE (come 20261013120200) e niente 42601.
--
-- Passo 5 (back office sul modello nuovo, D81): il ponte si gira, le fasce
-- scrivono le colonne di oggi. Quella scrittura imposta
-- `cataloglobe.schedule_bridge = 'from_slots'` (set_config locale alla
-- transazione) e questo trigger la lascia passare, così i due ponti non si
-- rincorrono. Al passo 5 questo trigger si toglie.
--
-- Riempimento: UPDATE di time_mode su sé stesso, che fa partire il ponte su
-- ogni regola. Una regola sola nel codice, la stessa per il dato vecchio e per
-- quello nuovo. In fondo un controllo dei conteggi: se non torna, la
-- migrazione si ferma e non resta niente.
--
-- Indietro: DROP TRIGGER trg_schedule_slots_from_legacy ON public.schedules;
--           DROP FUNCTION public.schedule_slots_from_legacy();
--           DELETE FROM public.schedule_slots;
-- =============================================================================

CREATE OR REPLACE FUNCTION public.schedule_slots_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_from integer;
  v_to   integer;
BEGIN
  IF current_setting('cataloglobe.schedule_bridge', true) = 'from_slots' THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.schedule_slots WHERE schedule_id = NEW.id;

  IF NEW.time_mode IS DISTINCT FROM 'window' THEN
    RETURN NULL;
  END IF;

  IF NEW.time_from IS NULL OR NEW.time_to IS NULL THEN
    IF NEW.days_of_week IS NULL THEN
      RETURN NULL;
    END IF;
    v_from := 0;
    v_to   := 1440;
  ELSE
    v_from := extract(hour FROM NEW.time_from)::integer * 60
              + extract(minute FROM NEW.time_from)::integer;
    v_to   := extract(hour FROM NEW.time_to)::integer * 60
              + extract(minute FROM NEW.time_to)::integer;
    IF v_to = 1439 AND v_from < 1439 THEN
      v_to := 1440;
    END IF;

    IF v_to <= v_from THEN
      INSERT INTO public.schedule_slots
        (tenant_id, schedule_id, days_of_week, start_minute, end_minute, sort_order)
      VALUES (NEW.tenant_id, NEW.id, '{}'::integer[], 0, 1440, 0);
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.schedule_slots
    (tenant_id, schedule_id, days_of_week, start_minute, end_minute, sort_order)
  VALUES (NEW.tenant_id, NEW.id, NEW.days_of_week, v_from, v_to, 0);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_schedule_slots_from_legacy ON public.schedules;
CREATE TRIGGER trg_schedule_slots_from_legacy
  AFTER INSERT OR UPDATE OF time_mode, days_of_week, time_from, time_to
  ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.schedule_slots_from_legacy();

UPDATE public.schedules SET time_mode = time_mode;

DO $$
DECLARE
  v_expected integer;
  v_slots    integer;
  v_multi    integer;
BEGIN
  SELECT count(*) INTO v_expected
    FROM public.schedules s
   WHERE s.time_mode = 'window'
     AND NOT (s.days_of_week IS NULL AND (s.time_from IS NULL OR s.time_to IS NULL));

  SELECT count(*) INTO v_slots FROM public.schedule_slots;

  SELECT count(*) INTO v_multi
    FROM (SELECT schedule_id FROM public.schedule_slots
           GROUP BY schedule_id HAVING count(*) > 1) m;

  IF v_slots <> v_expected OR v_multi > 0 THEN
    RAISE EXCEPTION 'schedule_slots: attese % fasce, trovate % (% regole con più fasce)',
      v_expected, v_slots, v_multi;
  END IF;

  IF EXISTS (SELECT 1 FROM public.schedule_slot_targets) THEN
    RAISE EXCEPTION 'schedule_slot_targets non è vuota: il passo 1 non la riempie';
  END IF;
END $$;
