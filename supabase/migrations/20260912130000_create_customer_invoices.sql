-- =============================================================================
-- customer_invoices — archivio fiscale degli incassi reali.
-- =============================================================================
--
-- Ogni riga rappresenta UN INCASSO (non un abbonamento): un pagamento Stripe
-- con amount_paid > 0. Scritta dal webhook (invoice.payment_succeeded) come
-- passo best-effort dopo la sincronizzazione dello stato subscription — vedi
-- supabase/functions/stripe-webhook/index.ts.
--
-- Non è una coda di lavorazione: le righe restano per la conservazione fiscale
-- decennale e cambiano solo `status` (da_emettere -> emessa). Da qui il nome
-- (non "pending_invoices" — "pending" invita a trattarla come qualcosa da
-- svuotare).
--
-- Identità fiscale copiata (snapshot), non referenziata: se il tenant modifica
-- i propri dati dopo l'incasso, la riga già scritta resta coerente con quanto
-- fatturato quel giorno.
--
-- Nessun FK su tenant_id: un FK renderebbe la cancellazione/purge di un tenant
-- (purge-tenant-now, _shared/tenant-purge.ts) dipendente da o distruttiva per
-- fatture già emesse, che devono sopravvivere 10 anni indipendentemente dal
-- ciclo di vita del tenant. tenant_id resta un riferimento per lookup, non un
-- vincolo referenziale.
--
-- plan_code/seats nullable: ricostruiti leggendo il tenant al momento
-- dell'evento. Se quella lettura fallisse, un NOT NULL farebbe fallire
-- l'intero INSERT — perdendo la registrazione dell'incasso per non perdere la
-- causale. Su un dato contabile si registra comunque; la causale si ricostruisce
-- a mano da Stripe se manca.
--
-- Deduplica: UNIQUE su stripe_invoice_id (la vera chiave di business — "questa
-- fattura Stripe ha già prodotto una riga"), non sul completion marker di
-- stripe_processed_events (quello deduplica per event_id/consegna, non per
-- fattura). Insert via upsert + ignoreDuplicates lato webhook.
--
-- RLS: abilitata, nessuna policy — stesso pattern di stripe_processed_events e
-- webhook_errors (20260428100000_stripe_webhook_hardening.sql). Nessuna UI
-- legge questa tabella oggi; service_role (webhook) bypassa RLS. Una policy
-- SELECT gated su is_platform_admin() arriverà nella migration che introduce
-- la pagina staff, non qui.
-- =============================================================================


BEGIN;


CREATE TABLE public.customer_invoices (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Riferimento tenant (denormalizzato, NO FK — vedi commento sopra)
    tenant_id                   uuid        NOT NULL,

    -- Incasso
    amount_cents                integer     NOT NULL CHECK (amount_cents > 0),
    currency                    text        NOT NULL,
    paid_at                     timestamptz NOT NULL,

    -- Causale ricostruita al momento dell'evento — nullable, vedi commento sopra
    plan_code                   text        NULL,
    seats                       integer     NULL,

    -- Identità fiscale — snapshot da tenants al momento dell'incasso
    legal_entity_type           text        NULL,
    legal_name                  text        NULL,
    vat_number                  text        NULL,
    fiscal_code                 text        NULL,
    first_name                  text        NULL,
    last_name                   text        NULL,
    address                     text        NULL,
    street_number               text        NULL,
    postal_code                 text        NULL,
    city                        text        NULL,
    province                    text        NULL,
    country                     text        NULL,
    pec                         text        NULL,
    codice_destinatario         text        NULL,

    -- Riferimenti Stripe
    stripe_invoice_id           text        NOT NULL,
    stripe_invoice_number       text        NULL,
    stripe_hosted_invoice_url   text        NULL,
    stripe_invoice_pdf          text        NULL,
    stripe_subscription_id      text        NULL,
    stripe_customer_id          text        NOT NULL,

    -- Stato emissione — nessuna UI lo scrive ancora, solo il default
    status                      text        NOT NULL DEFAULT 'da_emettere'
                                             CHECK (status IN ('da_emettere', 'emessa')),

    created_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT customer_invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id)
);

CREATE INDEX customer_invoices_tenant_id_idx ON public.customer_invoices (tenant_id);
CREATE INDEX customer_invoices_status_idx ON public.customer_invoices (status);

COMMENT ON TABLE public.customer_invoices IS
    'Archivio fiscale degli incassi reali (amount_paid > 0). Scritta best-effort da stripe-webhook su invoice.payment_succeeded. Righe permanenti (conservazione 10 anni) — status e'' l''unica cosa che cambia nel tempo.';

ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: solo service_role accede (bypassa RLS). Vedi commento in testa al file.


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'customer_invoices'
          AND relnamespace = 'public'::regnamespace
          AND relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'customer_invoices missing or RLS disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.customer_invoices'::regclass
          AND conname = 'customer_invoices_stripe_invoice_id_key'
    ) THEN
        RAISE EXCEPTION 'customer_invoices missing UNIQUE constraint on stripe_invoice_id';
    END IF;

    RAISE NOTICE 'Migration create_customer_invoices applied successfully';
END $$;


COMMIT;
