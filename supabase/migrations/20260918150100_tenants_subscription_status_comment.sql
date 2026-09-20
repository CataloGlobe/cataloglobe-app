COMMENT ON COLUMN public.tenants.subscription_status IS
'Stato abbonamento, dominio: trialing | active | past_due | suspended | canceled. '
'DEFAULT ''suspended'' (dal 2026-09-18): un tenant nasce senza aver pagato e resta fuori da tutte le allowlist '
'(resolve-public-catalog, ordini, prenotazioni, quota AI, list_active_public_slugs) finché stripe-webhook '
'(checkout.session.completed) o stripe-checkout-confirm (ritorno dal checkout / adozione) non scrivono lo stato reale della subscription Stripe. '
'Stesso valore ''suspended'' anche per Stripe incomplete/unpaid/paused (mapStripeStatus): la differenza è stripe_subscription_id NULL (mai pagato) vs valorizzato (sospeso da Stripe). '
'Scritto solo da: stripe-webhook, stripe-checkout-confirm, cron expire-tenant-trials (trialing→past_due), RPC transfer ownership (→trialing).';
