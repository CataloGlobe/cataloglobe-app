-- Fotografia per il confronto «vincitore uguale a prima» (scripts/officina-confronto).
-- SOLA LETTURA: una SELECT che restituisce un oggetto JSON, da salvare in un file
-- e passare a `cli.ts esito --dati <file>`. Nessuna scrittura, nessuna funzione.
--
--   psql "$DB_URL" -At -f scripts/officina-confronto/fotografia.sql > fotografia.json
--
-- (oppure la stessa query dall'SQL editor o dall'MCP, copiando il valore di `fotografia`).
-- Le tabelle della fase (a) (`schedule_slots`) si leggono già: vuote finché la (b)
-- non le riempie.

select json_build_object(
    'fonte', current_database(),
    'letta_il', now(),
    'activities', coalesce((
        select json_agg(json_build_object(
            'id', a.id,
            'tenant_id', a.tenant_id,
            'tenant_name', t.name,
            'name', a.name,
            'status', a.status,
            'group_ids', coalesce((
                select json_agg(m.group_id order by m.group_id)
                from public.activity_group_members m
                where m.activity_id = a.id
            ), '[]'::json)
        ) order by a.id)
        from public.activities a
        join public.tenants t on t.id = a.tenant_id
    ), '[]'::json),
    'schedules', coalesce((
        select json_agg(json_build_object(
            'id', s.id,
            'tenant_id', s.tenant_id,
            'name', s.name,
            'rule_type', s.rule_type,
            'enabled', s.enabled,
            'apply_to_all', s.apply_to_all,
            'priority', s.priority,
            'created_at', s.created_at,
            'time_mode', s.time_mode,
            'days_of_week', s.days_of_week,
            'time_from', s.time_from,
            'time_to', s.time_to,
            'start_at', s.start_at,
            'end_at', s.end_at
        ) order by s.id)
        from public.schedules s
    ), '[]'::json),
    'targets', coalesce((
        select json_agg(json_build_object(
            'schedule_id', st.schedule_id,
            'target_type', st.target_type,
            'target_id', st.target_id
        ) order by st.schedule_id, st.target_id)
        from public.schedule_targets st
    ), '[]'::json),
    'layouts', coalesce((
        select json_agg(json_build_object(
            'schedule_id', sl.schedule_id,
            'catalog_id', sl.catalog_id,
            'style_id', sl.style_id
        ) order by sl.schedule_id)
        from public.schedule_layout sl
    ), '[]'::json),
    'featured_links', coalesce((
        select json_agg(json_build_object(
            'schedule_id', sfc.schedule_id,
            'featured_content_id', sfc.featured_content_id,
            'slot', sfc.slot,
            'sort_order', sfc.sort_order,
            'status', fc.status
        ) order by sfc.schedule_id, sfc.sort_order, sfc.featured_content_id)
        from public.schedule_featured_contents sfc
        join public.featured_contents fc on fc.id = sfc.featured_content_id
    ), '[]'::json),
    'slots', coalesce((
        select json_agg(json_build_object(
            'id', ss.id,
            'schedule_id', ss.schedule_id,
            'days_of_week', ss.days_of_week,
            'start_minute', ss.start_minute,
            'end_minute', ss.end_minute
        ) order by ss.schedule_id, ss.sort_order, ss.id)
        from public.schedule_slots ss
    ), '[]'::json),
    'slot_targets', coalesce((
        select json_agg(json_build_object(
            'slot_id', sst.slot_id,
            'target_type', st.target_type,
            'target_id', st.target_id
        ) order by sst.slot_id, st.target_type, st.target_id)
        from public.schedule_slot_targets sst
        join public.schedule_targets st on st.id = sst.schedule_target_id
    ), '[]'::json)
) as fotografia;
