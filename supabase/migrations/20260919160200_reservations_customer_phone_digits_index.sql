-- Indice GIN trigram su customer_phone_digits: serve `LIKE '%<cifre>'` con
-- almeno 3 caratteri (la ricerca ne richiede 4). Senza, la colonna nuova
-- avrebbe solo spostato la scansione (FASE 5.4).

CREATE INDEX IF NOT EXISTS idx_reservations_customer_phone_digits_trgm
    ON public.reservations USING gin (customer_phone_digits extensions.gin_trgm_ops);
