-- =============================================================================
-- Rimuove il job pg_cron 'expire-trial-subscriptions'
--
-- Il job NON esiste in nessuna migration del repo: è un residuo creato a mano
-- in produzione (predecessore di 'expire-tenant-trials', che oggi è l'unico
-- job di scadenza trial — vedi 20260907194739). Due job che scadono i trial
-- con logiche diverse sono una fonte di stato incoerente con Stripe.
--
-- Idempotente: se il job non c'è (staging, ambienti nuovi) non fa nulla.
-- Un solo statement: pusha con `supabase db push` senza incorrere nel 42601
-- (vedi memory/reference_db_push_one_command.md).
-- =============================================================================

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'expire-trial-subscriptions';
