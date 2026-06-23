-- =============================================================================
-- Idempotency key per prevenire la creazione di tenant duplicati da submit di
-- checkout concorrenti o ripetuti (doppio click, multi-tab, reload a meta' flusso,
-- abbandono di Stripe + ri-tentativo). Il guard frontend (inFlightRef) copre solo
-- il singolo tick; questa e' la garanzia hard a livello DB.
--
-- Colonna NULLABLE: i tenant esistenti restano a NULL senza backfill.
-- L'indice UNIQUE e' PARZIALE (WHERE ... IS NOT NULL) cosi' i NULL multipli dei
-- tenant legacy non collidono; l'unicita' vale solo sulle key valorizzate.
--
-- DDL puro (ADD COLUMN + CREATE INDEX): nessun CREATE FUNCTION, quindi nessun
-- rischio SQLSTATE 42601 con `supabase db push`.
--
-- La policy INSERT su tenants e' row-level (WITH CHECK owner_user_id = auth.uid(),
-- migration 20260309100000): non restringe per colonna, quindi il client puo'
-- valorizzare la nuova colonna senza modifiche alle policy.
-- =============================================================================

ALTER TABLE public.tenants
    ADD COLUMN creation_idempotency_key uuid;

CREATE UNIQUE INDEX tenants_creation_idempotency_key_uidx
    ON public.tenants (creation_idempotency_key)
    WHERE creation_idempotency_key IS NOT NULL;
