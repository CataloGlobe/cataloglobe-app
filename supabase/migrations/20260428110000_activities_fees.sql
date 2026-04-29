ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS fees JSONB NULL,
  ADD COLUMN IF NOT EXISTS fees_public BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN activities.fees IS
  'Array di voci tariffarie predefinite: [{key, value}].
   Chiavi ammesse: coperto, servizio, prenotazione_minima,
   spesa_minima, eta_minima';
