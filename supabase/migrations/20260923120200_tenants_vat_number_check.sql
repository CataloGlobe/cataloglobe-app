-- =============================================================================
-- tenants.vat_number: CHECK sul check digit P.IVA (difesa in profondità).
-- =============================================================================
--
-- CreateBusinessWizard crea il tenant con un insert client-side diretto su
-- public.tenants (buildBillingPayload), che scavalca la validazione della RPC
-- update_tenant_billing_details. Il gate bloccante sul pagamento resta in
-- stripe-checkout (nessuno paga con P.IVA invalida); questo vincolo chiude il
-- dato sporco in DB su qualunque percorso di scrittura, REST diretto incluso.
--
-- NOT VALID: in staging esistono 3 righe di test con vat_number '12345678901'
-- (check digit errato). NOT VALID non verifica le righe esistenti, così la
-- stessa migration gira identica in staging e produzione. Le righe nuove e
-- ogni UPDATE successivo vengono comunque verificati.
--
-- Produzione: le 4 P.IVA attuali passano già il check → VALIDATE CONSTRAINT
-- eseguibile quando si vuole:
--   ALTER TABLE public.tenants VALIDATE CONSTRAINT tenants_vat_number_valid;
-- In staging solo dopo aver portato le 3 righe di test a '12345678911'
-- (valida; non NULL, servono a provare il gate di stripe-checkout).
-- Verificato su staging in transazione annullata (2026-09-23): con le 3
-- righe sistemate VALIDATE CONSTRAINT passa. Quindi, dopo l'apply, il
-- vincolo va validato in ENTRAMBI gli ambienti, non lasciato NOT VALID.
--
-- ATTENZIONE (staging): con NOT VALID il CHECK si rivaluta su OGNI UPDATE
-- di quelle 3 righe, anche su colonne diverse da vat_number (es. il webhook
-- Stripe che aggiorna subscription_status) → 23514.
-- =============================================================================

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_vat_number_valid
  CHECK (public.is_valid_partita_iva(vat_number))
  NOT VALID;
