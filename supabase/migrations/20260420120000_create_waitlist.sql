-- Tabella waitlist per raccolta contatti pre-lancio
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  activity_type TEXT CHECK (activity_type IN ('ristorante', 'bar', 'hotel', 'retail', 'altro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice unique su email per evitare duplicati
CREATE UNIQUE INDEX waitlist_email_unique ON waitlist (LOWER(email));

-- RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Chiunque può inserire (la landing è pubblica, niente auth)
CREATE POLICY "anon_insert_waitlist" ON waitlist
  FOR INSERT TO anon
  WITH CHECK (true);

-- Solo utenti autenticati possono leggere (per il backoffice futuro)
CREATE POLICY "authenticated_select_waitlist" ON waitlist
  FOR SELECT TO authenticated
  USING (true);
