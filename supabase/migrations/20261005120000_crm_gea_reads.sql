-- =============================================================================
-- Gea 2: tre letture in più (sola lettura, service role)
-- =============================================================================
--
-- Funzioni nuove, nessuna tabella o funzione esistente cambia. Come le altre
-- crm_gea_*: SECURITY INVOKER (le chiama la edge col service role), testi
-- liberi passati da crm_gea_mask, dei contatti resta il nome.
--   crm_gea_pending_drafts  bozze degli agenti che aspettano una decisione.
--   crm_gea_venue_chat      la chat WhatsApp di un locale, ultimi 20 messaggi.
--   crm_gea_diary           il diario degli agenti degli ultimi N giorni (1-7).
-- La spesa AI la legge crm_ai_spend, già esistente.
-- Finché questa migrazione non è applicata, Gea risponde «Questo non lo so
-- ancora leggere» per queste tre letture e le altre funzionano.
-- Grant nel file successivo (20261005120100).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_gea_pending_drafts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT coalesce(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at), '[]'::jsonb)
    FROM (
        SELECT d.created_at, d.kind, v.name AS venue, v.city, m.display_name AS assigned_to,
               left(public.crm_gea_mask(d.proposed_text), 300) AS text
        FROM public.crm_agent_drafts d
        JOIN public.crm_venues v ON v.id = d.venue_id
        LEFT JOIN public.crm_team_members m ON m.user_id = v.assigned_to
        WHERE d.status = 'pending'
        ORDER BY d.created_at
        LIMIT 15
    ) r;
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_venue_chat(p_venue_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT jsonb_build_object(
        'venue', v.name,
        'city', v.city,
        'stage', v.stage,
        'messages', (
            -- Dal più recente: se il prompt taglia, si perde la parte più vecchia.
            SELECT coalesce(jsonb_agg(x ORDER BY x.at DESC), '[]'::jsonb) FROM (
                SELECT msg.created_at AS at, msg.direction, msg.author, msg.kind,
                       left(public.crm_gea_mask(msg.body), 300) AS text, msg.status
                FROM public.crm_messages msg
                WHERE msg.venue_id = v.id
                ORDER BY msg.created_at DESC LIMIT 20
            ) x
        )
    )
    FROM public.crm_venues v
    WHERE v.id = p_venue_id;
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_diary(p_days integer DEFAULT 1)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT coalesce(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM (
        SELECT d.created_at, d.actor, m.display_name AS person, d.action,
               left(public.crm_gea_mask(d.reason), 300) AS reason,
               d.review_outcome, v.name AS venue
        FROM public.crm_agent_decisions d
        LEFT JOIN public.crm_venues v ON v.id = d.venue_id
        LEFT JOIN public.crm_team_members m ON m.user_id = d.actor_user_id
        WHERE d.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 1), 1), 7))
        ORDER BY d.created_at DESC
        LIMIT 30
    ) r;
$$;
