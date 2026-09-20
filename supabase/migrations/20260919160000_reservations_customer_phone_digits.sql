-- =========================================
-- RESERVATIONS — le sole cifre del telefono, calcolate in scrittura (FASE 5.4)
-- =========================================
-- La ricerca per telefono confronta cifre contro cifre, per suffisso: chi
-- cerca digita 3331234567, in tabella c'è «+39 333 123 4567». Normalizzare
-- in lettura (regexp_replace nella WHERE) renderebbe inutile qualsiasi
-- indice; la forma giusta è una colonna con le sole cifre, calcolata dal DB
-- a ogni scrittura, su cui il filtro del server è esatto e indicizzabile.
--
-- Colonna GENERATED, non trigger: niente backfill, nessuna deriva possibile,
-- le righe esistenti vengono calcolate dall'ALTER stesso.
--
-- coalesce(e164, grezzo): quando il canonico c'è, le cifre includono il
-- prefisso (+39 → 39…), così «3331234567» e «+39 333 123 4567» digitati
-- dall'operatore trovano entrambi la riga; quando il parsing è fallito,
-- restano le cifre del campo libero — ed è proprio quel caso (spazi o
-- trattini, e164 NULL) che oggi non è cercabile.
--
-- Un solo comando: `supabase db push` fallisce con 42601 sui file multipli.

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS customer_phone_digits text
    GENERATED ALWAYS AS (
        regexp_replace(coalesce(customer_phone_e164, customer_phone), '[^0-9]', '', 'g')
    ) STORED;
