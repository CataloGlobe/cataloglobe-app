-- Aggiunge campi legali/fiscali alla tabella tenants.
-- Pattern allineato a `activities` per coerenza nomi colonna indirizzo.
-- Tutti i campi sono nullable: tenant creati prima di questa migration restano validi.

ALTER TABLE public.tenants ADD COLUMN legal_name TEXT;
ALTER TABLE public.tenants ADD COLUMN vat_number TEXT;
ALTER TABLE public.tenants ADD COLUMN fiscal_code TEXT;
ALTER TABLE public.tenants ADD COLUMN ateco TEXT;
ALTER TABLE public.tenants ADD COLUMN rea_code TEXT;

-- Indirizzo sede legale (stesso pattern di activities)
ALTER TABLE public.tenants ADD COLUMN address TEXT;
ALTER TABLE public.tenants ADD COLUMN street_number TEXT;
ALTER TABLE public.tenants ADD COLUMN postal_code TEXT;
ALTER TABLE public.tenants ADD COLUMN city TEXT;
ALTER TABLE public.tenants ADD COLUMN province TEXT;
ALTER TABLE public.tenants ADD COLUMN country TEXT DEFAULT 'IT';

-- Contatti legali
ALTER TABLE public.tenants ADD COLUMN pec TEXT;

-- Indici utili per future query di fatturazione/billing
CREATE INDEX IF NOT EXISTS tenants_vat_number_idx ON public.tenants(vat_number) WHERE vat_number IS NOT NULL;
