-- Aggiunge colonna request_ip alla tabella reviews per rate limiting
-- per IP sulle review anonime da pagina pubblica.

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS request_ip TEXT;

CREATE INDEX IF NOT EXISTS idx_reviews_request_ip_created
  ON public.reviews (request_ip, created_at DESC);
