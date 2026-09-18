-- FASE 5.3 (gruppo finale) — identica a 20260902120001 MENO `venue_notes` e
-- `tags`: nota e tag del locale vivono in `reservation_guest_notes`, per sede,
-- e li legge il service con una query sua. `security_invoker` come prima: la
-- RLS di `reservations` filtra le visite riga per riga, e la vista esclude i
-- profili senza alcuna visita visibile al caller.
CREATE VIEW public.v_reservation_guests_directory
WITH (security_invoker = on) AS
SELECT
  g.id,
  g.tenant_id,
  g.phone_e164,
  g.display_name,
  g.email,
  s.visible_visits,
  s.visible_no_shows,
  s.first_visit_date,
  s.last_visit_date,
  s.visible_activities,
  g.created_at,
  g.updated_at
FROM public.reservation_guests g
JOIN public.v_reservation_guest_stats s ON s.guest_id = g.id
WHERE s.visible_visits > 0;
