-- Aggiunge il motivo di sospensione alle attività
ALTER TABLE activities
  ADD COLUMN inactive_reason TEXT NULL
  CHECK (inactive_reason IN ('maintenance', 'closed', 'unavailable'));
