-- Un tenant appena creato non ha ancora pagato: nasce 'suspended', fuori da
-- ogni allowlist (menu pubblico, ordini, prenotazioni, quota AI) finché
-- stripe-webhook o stripe-checkout-confirm non lo collegano alla subscription
-- e scrivono lo stato reale. Prima nasceva 'trialing' e il QR era online
-- senza checkout. Solo INSERT futuri: nessuna riga esistente cambia.
ALTER TABLE public.tenants ALTER COLUMN subscription_status SET DEFAULT 'suspended';
