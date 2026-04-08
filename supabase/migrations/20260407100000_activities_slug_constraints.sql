-- Constraint formato slug: solo lettere minuscole, numeri, trattini
ALTER TABLE activities
  ADD CONSTRAINT activities_slug_format
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$');

-- Lunghezza minima e massima
ALTER TABLE activities
  ADD CONSTRAINT activities_slug_length
  CHECK (char_length(slug) >= 3 AND char_length(slug) <= 60);
