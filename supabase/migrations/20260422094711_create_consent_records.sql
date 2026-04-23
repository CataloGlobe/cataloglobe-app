CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('privacy_policy', 'terms_of_service')),
  document_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT
);

CREATE INDEX idx_consent_records_user_id ON consent_records(user_id);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- L'utente può leggere solo i propri consensi
CREATE POLICY "Users can view own consents"
  ON consent_records FOR SELECT
  USING (user_id = auth.uid());

-- L'utente può inserire solo i propri consensi
CREATE POLICY "Users can insert own consents"
  ON consent_records FOR INSERT
  WITH CHECK (user_id = auth.uid());
