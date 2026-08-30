-- =============================================================================
-- Job pg_cron: promemoria prenotazioni, ogni giorno alle 18:00 ora italiana.
-- =============================================================================
--
-- Modello: `20260503230000_translations_pg_cron.sql` (unschedule idempotente →
-- cron.schedule → DO block → segreti dal vault → guardia sui NULL →
-- net.http_post con header segreto). Scelto rispetto ai job purge perche' e'
-- l'unico la cui edge verifica il segreto in tempo costante e fallisce chiusa.
--
-- ── Perche' due orari e una guardia ─────────────────────────────────────────
-- `cron.timezone` vale GMT ed e' un parametro `postmaster`: cambiarlo richiede
-- il riavvio del server, che su Supabase gestito non e' nostro. Quindi il cron
-- ragiona in UTC, e le 18:00 di Roma sono le 17:00 UTC d'inverno (CET, +1) e le
-- 16:00 UTC d'estate (CEST, +2). Nessuna singola espressione crontab copre
-- entrambi i periodi: i cambi d'ora cadono l'ultima domenica di marzo e
-- ottobre, date che il crontab non sa esprimere.
--
-- Si schedula quindi a ENTRAMBE le ore e si lascia passare solo l'esecuzione in
-- cui a Roma sono davvero le 18. Delle due ne passa sempre esattamente una,
-- tutto l'anno, cambi d'ora inclusi. L'altra esce in millisecondi senza
-- svegliare l'edge function.
--
-- La guardia sta qui e non nell'edge di proposito: l'orario e' una proprieta'
-- della schedulazione, e l'edge deve restare invocabile a mano per un
-- ritentativo senza dover fingere che siano le 18.
--
-- Alternativa scartata: `0 * * * *` con guardia oraria. Stessa correttezza, 24
-- risvegli al giorno invece di 2, senza nulla in cambio.
--
-- ── Segreti richiesti nel vault ─────────────────────────────────────────────
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
    -- 16:00 e 17:00 UTC: una delle due e' sempre le 18:00 a Roma.
    '0 16,17 * * *',
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
        -- Passa solo l'esecuzione che coincide con le 18:00 italiane.
        IF v_rome_hour <> 18 THEN
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
            body    := '{}'::jsonb
        );
    END;
    $$;
    $job$
);
