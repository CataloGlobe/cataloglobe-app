-- v_tables_with_state era SECURITY DEFINER (owner postgres): leggeva le 5 tabelle sottostanti
-- bypassando la RLS = path di lettura cross-tenant per qualsiasi authenticated.
-- security_invoker=on applica la RLS del chiamante. Coverage verificata: tutte e 5 le tabelle
-- hanno policy SELECT authenticated scoped per activity (tables.read / orders.read).
-- Nota: un ruolo con solo tables.read vedra i tavoli con metriche ordini azzerate
-- (prima le vedeva bypassando la RLS) — comportamento corretto e desiderato.
ALTER VIEW public.v_tables_with_state SET (security_invoker = on);
