-- D20: l'IP di chi lascia una recensione non serve più (il limite usa un
-- contatore con l'IP in hash, `rate_limit_buckets`). Si svuota la colonna e
-- si toglie l'indice. La colonna resta per ora: l'edge in produzione la scrive
-- finché non arriva la versione nuova; si toglie in un rilascio successivo.

UPDATE public.reviews SET request_ip = NULL WHERE request_ip IS NOT NULL;

DROP INDEX IF EXISTS public.idx_reviews_request_ip_created;

COMMENT ON COLUMN public.reviews.request_ip IS
  'Non più usata (D20, 2026-10-09): sempre NULL, da rimuovere in un rilascio successivo.';
