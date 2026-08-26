-- =========================================
-- RESERVATIONS — canonical phone (E.164)
-- =========================================
-- `customer_phone` keeps the raw string exactly as the customer typed it
-- (it is what the venue reads in emails and in the dashboard, and what the
-- `tel:` link uses). The same person writing 3451559558 / 345 155 9558 /
-- +39 345 1559558 / 0039 345 1559558 produces four different values, so the
-- raw column cannot be an identity key.
--
-- `customer_phone_e164` is the canonical form (+393451559558), computed at
-- write time by `normalizePhoneToE164` (duplicated FE ↔ Edge, header
-- `⚠️ SYNC`). It is the intended lookup key for the future guest profile.
--
-- NULLABLE BY DESIGN: when parsing fails the column stays empty and the
-- reservation goes through unchanged. A number we cannot canonicalise must
-- never cost a booking. On the public path the value is written by a
-- best-effort UPDATE issued by `submit-reservation` right after
-- `place_online_reservation` returns — the RPC itself is untouched, so a
-- failure of that UPDATE leaves the column NULL and nothing else.
--
-- NO BACKFILL, deliberately. The existing rows (7 on staging, a single
-- distinct phone number between them) are test data: recomputing them is not
-- worth a migration step. They stay NULL and will simply never match a guest
-- profile lookup.
--
-- The index is partial: today every row is NULL, and rows that never get a
-- canonical value carry no lookup weight. `tenant_id` leads because every
-- lookup is tenant-scoped (RLS filters by activity permission on top).
--
-- ALTER TABLE + CREATE INDEX only — no CREATE FUNCTION, no GRANT/REVOKE, so
-- this is safe for a single-file `supabase db push`.

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS customer_phone_e164 text NULL;

COMMENT ON COLUMN public.reservations.customer_phone_e164 IS
    'Telefono cliente in forma canonica E.164 (+393451559558), calcolato a write time da normalizePhoneToE164. NULL quando il numero grezzo non e'' interpretabile: il valore grezzo resta in customer_phone. Chiave prevista per il lookup del profilo ospite.';

CREATE INDEX IF NOT EXISTS idx_reservations_tenant_phone_e164
    ON public.reservations (tenant_id, customer_phone_e164)
    WHERE customer_phone_e164 IS NOT NULL;
