-- =============================================================================
-- Job pg_cron: promemoria prenotazioni, TRE passate invece di una.
-- 18:00, 19:00 e 20:00 ora italiana.
-- =============================================================================
--
-- Sostituisce la schedulazione di `20260829120001_reservation_reminders_cron.sql`
-- (un solo giro alle 18:00). Stesso job, stesso nome, stessa forma: unschedule
-- idempotente → cron.schedule → DO block → segreti dal vault → guardia sui NULL
-- → net.http_post con header segreto.
--
-- ── Perche' tre passate non producono doppioni ──────────────────────────────
-- Non e' un caso fortunato ne' una scommessa sui tempi: e' una proprieta' del
-- claim, ed e' l'unica ragione per cui questo cambio e' sicuro.
--
-- L'edge function rivendica ogni riga con un solo statement
--
--     UPDATE reservations SET reminder_sent_at = now()
--     WHERE id = ... AND reminder_sent_at IS NULL RETURNING id
--
-- e manda l'email solo se ha ottenuto la riga. Chi ha gia' ricevuto il
-- promemoria ha `reminder_sent_at` valorizzato, quindi:
--   - non compare piu' fra i candidati (la SELECT filtra `IS NULL`);
--   - e anche se ci comparisse per una corsa fra due passate, l'UPDATE non lo
--     rivendicherebbe e la seconda passata non manderebbe nulla.
-- L'esclusione vive dentro l'UPDATE e non in un controllo che lo precede: regge
-- il cron eseguito piu' volte, il ritentativo e due worker in parallelo.
--
-- La passata delle 19 e delle 20, in una giornata normale, trova zero candidati
-- ed esce in millisecondi.
--
-- ── Perche' tre passate servono ─────────────────────────────────────────────
-- Il 09/09 la passata delle 18 ha trovato un candidato, ha tentato il claim e
-- ha ricevuto un `504 Gateway Timeout`. Con una sola occasione al giorno, quel
-- promemoria era perso: il cron successivo cerca le prenotazioni del giorno
-- dopo, non piu' quelle rimaste indietro. Con tre occasioni, un intoppo alle 18
-- costa un'ora di ritardo invece di un promemoria mancato.
--
-- Effetto collaterale voluto: una prenotazione confermata alle 19:30 per il
-- giorno dopo riceve il promemoria alle 20, invece di non riceverlo affatto.
--
-- ── Perche' quattro ore UTC per tre passate ─────────────────────────────────
-- `cron.timezone` vale GMT ed e' un parametro `postmaster`: cambiarlo richiede
-- il riavvio del server, che su Supabase gestito non e' nostro. Il cron ragiona
-- quindi in UTC, e le ore italiane si spostano con l'ora legale:
--
--     Roma      inverno (CET, +1)   estate (CEST, +2)
--     18:00     17:00 UTC           16:00 UTC
--     19:00     18:00 UTC           17:00 UTC
--     20:00     19:00 UTC           18:00 UTC
--
-- L'unione dei due insiemi e' {16,17,18,19} UTC: quattro risvegli, di cui ne
-- passano esattamente TRE al giorno tutto l'anno, cambi d'ora inclusi. Il
-- quarto esce in millisecondi senza svegliare l'edge function.
--
-- La guardia sta qui e non nell'edge di proposito: l'orario e' una proprieta'
-- della schedulazione, e l'edge deve restare invocabile a mano per un
-- ritentativo senza dover fingere che sia una certa ora.
--
-- ── Body: dichiara di essere il cron ────────────────────────────────────────
-- `{"source":"cron"}` popola `reservation_reminder_runs.trigger_source`. Senza,
-- l'edge registra `manual`: e' il default prudente, perche' e' l'invocazione a
-- mano quella che si fa di fretta e senza dichiararsi, e attribuire al cron un
-- successo che non e' suo e' esattamente l'errore che ci ha fatto contare tre
-- invii riusciti quando erano due.
--
-- ── Segreti richiesti nel vault (invariati) ─────────────────────────────────
--   reservation_reminders_url     → https://<ref>.supabase.co/functions/v1/send-reservation-reminders
--   reservation_reminders_secret  → stesso valore di RESERVATION_REMINDERS_SECRET sull'edge
-- Se manca uno dei due il job esce con NOTICE senza chiamare nulla: un deploy
-- incompleto non deve tradursi in chiamate non autenticate.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-reservation-reminders') THEN
        PERFORM cron.unschedule('send-reservation-reminders');
    END IF;
END $$;

SELECT cron.schedule(
    'send-reservation-reminders',
    -- 16,17,18,19 UTC: ne passano tre, che a Roma sono le 18, le 19 e le 20.
    '0 16,17,18,19 * * *',
    $job$
    DO $$
    DECLARE
        v_rome_hour INT := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/Rome'));

        v_url TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'reservation_reminders_url'
            LIMIT 1
        );
        v_secret TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'reservation_reminders_secret'
            LIMIT 1
        );
    BEGIN
        -- Passano solo le esecuzioni che a Roma cadono alle 18, 19 o 20.
        IF v_rome_hour NOT IN (18, 19, 20) THEN
            RETURN;
        END IF;

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'send-reservation-reminders cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'X-Job-Secret', v_secret
            ),
            body    := '{"source":"cron"}'::jsonb
        );
    END;
    $$;
    $job$
);
