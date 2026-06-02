-- customer_sessions.device_id — idempotency fingerprint per "device" cliente.
--
-- Motivazione: oggi `resolve-table` crea una nuova `customer_sessions` ad
-- ogni invocazione senza fingerprint stabile lato client. Risultato:
-- 2+ sessioni duplicate al primo scan QR per:
--   - React StrictMode in dev (doppia chiamata simultanea)
--   - refresh pagina QR entry
--   - apertura del QR in piu' tab
--   - retry post-errore di rete
--
-- Fix: il frontend genera UNA volta un UUID, lo persiste in localStorage
-- (`cataloglobe-device-id`), e lo passa ad ogni `resolve-table`. L'Edge
-- function cerca una customer_session attiva (expires_at > now()) per
-- (device_id, tenant_id) — tenant_id sempre derivato dal tavolo risolto,
-- mai dal client — e la riprende invece di crearne una nuova.
--
-- Sicurezza:
--   - device_id NON conferisce autorizzazione cross-tenant: il match
--     richiede ANCHE tenant_id, che e' lato server.
--   - device_id NON e' un secret: e' un random UUID lato client (no PII,
--     no fingerprinting browser). Il bearer per ordering resta il
--     customer JWT custom firmato dall'Edge.
--   - DEFAULT gen_random_uuid() rende backward-compat sicuro: righe
--     pre-esistenti ottengono valori distinti automaticamente; nuove
--     righe pre-Edge-deploy continuano a ricevere un device_id distinto
--     se non passato (no collisioni accidentali).
--
-- Index: semplice (device_id, tenant_id). NON predicato partial su
-- `expires_at > now()` perche' `now()` non e' immutable e Postgres
-- rifiuta partial index su predicati volatili. La query Edge filtra
-- `expires_at > now()` runtime — match rapido grazie all'index su
-- (device_id, tenant_id), che ha selettivita' alta in pratica
-- (1-pochi righe per coppia).

ALTER TABLE public.customer_sessions
ADD COLUMN device_id text NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_customer_sessions_device_tenant
    ON public.customer_sessions (device_id, tenant_id);

COMMENT ON COLUMN public.customer_sessions.device_id IS
    'Random UUID lato client (localStorage), persistente per dispositivo. '
    'Usato da resolve-table per riconoscere lo stesso device e riusare '
    'la session attiva invece di crearne una nuova. NON e'' un secret: '
    'NON conferisce autorizzazione cross-tenant — il match richiede '
    'sempre il tenant_id derivato dal tavolo risolto server-side.';
