-- =============================================================================
-- CRM interno (Fase 0): copia della landing, telefono non valido
-- =============================================================================
-- `leads.phone` ha solo un CHECK di lunghezza: il formato E.164 lo garantisce
-- submit-lead, non il database. Con un telefono fuori formato crm_ingest_lead
-- rifiuta (invalid_phone), il lead non entra mai in crm_leads e la copia lo
-- riprende ogni minuto per sempre, con un WARNING a ogni giro.
-- Qui il telefono fuori formato non blocca: il lead entra senza telefono e il
-- valore originale resta in form_answers.phone_raw, leggibile dalla scheda.
-- Il resto della funzione è identico a 20261001120100. Le ACL restano quelle
-- di 20261001120200 (CREATE OR REPLACE le conserva).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_sync_landing_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    r          record;
    v_count    integer := 0;
    v_phone_ok boolean;
BEGIN
    FOR r IN
        SELECT l.*
        FROM public.leads l
        WHERE l.status <> 'spam'
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_leads cl
              WHERE cl.source = 'landing' AND cl.source_ref = l.id::text
          )
        ORDER BY l.created_at
        LIMIT 200
    LOOP
        v_phone_ok := r.phone ~ '^\+[1-9][0-9]{6,14}$';
        BEGIN
            PERFORM public.crm_ingest_lead(
                p_source       := 'landing',
                p_source_ref   := r.id::text,
                p_name         := r.name,
                p_venue_name   := r.venue_name,
                p_phone_e164   := CASE WHEN v_phone_ok THEN r.phone END,
                p_email        := r.email,
                p_interests    := r.interests,
                p_form_answers := jsonb_strip_nulls(jsonb_build_object(
                    'variant',      r.variant,
                    'utm_source',   r.utm_source,
                    'utm_medium',   r.utm_medium,
                    'utm_campaign', r.utm_campaign,
                    'utm_content',  r.utm_content,
                    'utm_term',     r.utm_term,
                    'referrer',     r.referrer,
                    'landing_path', r.landing_path,
                    'phone_raw',    CASE WHEN v_phone_ok THEN NULL ELSE r.phone END
                )),
                -- Con un annuncio Meta verso la landing, utm_content porta il
                -- nome dell'annuncio (convenzione da concordare con Ferdinando).
                p_ad_name      := r.utm_content,
                p_campaign     := r.utm_campaign,
                p_consent_at   := r.consent_at,
                p_consent_text := r.consent_text,
                p_received_at  := r.created_at
            );
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'crm_sync_landing_leads: lead % saltato (%: %)', r.id, SQLSTATE, SQLERRM;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;
