ALTER TABLE orders
  ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN orders.created_by_user_id IS
  'Operatore (auth.users) che ha creato l''ordine manualmente da admin. NULL per ordini cliente.';
