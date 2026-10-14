BEGIN;

-- =============================================================================
-- NOTIFICHE: ABBONAMENTO (PR 5 del motore)
-- =============================================================================
-- Solo campanella, solo all'owner (deciso da Lorenzo il 2026-10-15). Le scrive
-- `stripe-webhook` con `_shared/notify.ts`, dopo la logica esistente e mai
-- bloccante. `customer.subscription.trial_will_end` va acceso nell'endpoint
-- webhook di Stripe (3 giorni prima della fine della prova).
-- Solo righe del catalogo: niente funzioni, quindi niente file di GRANT.
-- =============================================================================

INSERT INTO public.notification_types
    (event_type, category, type, title_template, message_template, in_app, email, email_template, can_mute)
VALUES
    ('billing.payment_failed', 'abbonamento', 'warning',
        'Pagamento non riuscito per «{tenant_name}»',
        'Stripe riproverà nei prossimi giorni. Controlla il metodo di pagamento in Abbonamento per non interrompere il servizio.',
        true, false, NULL, false),
    ('billing.trial_ending', 'abbonamento', 'info',
        'La prova di «{tenant_name}» finisce il {trial_end_label}',
        'Dopo parte l''abbonamento con il metodo di pagamento salvato. Lo trovi in Abbonamento.',
        true, false, NULL, false)
ON CONFLICT (event_type) DO NOTHING;

COMMIT;
