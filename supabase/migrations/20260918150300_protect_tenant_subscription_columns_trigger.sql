-- Aggancio di protect_tenant_subscription_columns (file precedente).
-- BEFORE INSERT OR UPDATE: il wizard inserisce la riga dal client, quindi
-- l'INSERT va coperto quanto l'UPDATE. Stesso pattern di
-- trg_protect_tenant_deleted_at.
CREATE TRIGGER trg_protect_tenant_subscription_columns
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.protect_tenant_subscription_columns();
