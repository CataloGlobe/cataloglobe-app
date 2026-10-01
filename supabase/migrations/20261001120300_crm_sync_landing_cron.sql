-- =============================================================================
-- CRM interno (Fase 0): copia dei lead della landing ogni minuto
-- =============================================================================
-- Chiama `public.crm_sync_landing_leads()` (20261001120100), che copia nel CRM
-- i nuovi contatti di `public.leads`. Nessun segreto e nessuna edge: tutto in
-- SQL, come postgres. A vuoto costa una NOT EXISTS su due indici.
--
-- È anche la rete di sicurezza dell'ingresso: un contatto che non entra viene
-- riprovato al minuto successivo. `submit-lead` e `public.leads` non cambiano.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-sync-landing-leads') THEN
        PERFORM cron.unschedule('crm-sync-landing-leads');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-sync-landing-leads',
    '* * * * *',
    $job$SELECT public.crm_sync_landing_leads();$job$
);
