-- FIX Security Advisor (security_definer_view): user_tenants_view
-- La view deve girare come INVOKER e delegare l'access control a get_user_tenants()
-- (SECURITY DEFINER, usa auth.uid()). Senza security_invoker la view gira come owner
-- (postgres) → Advisor la flagga come SECURITY DEFINER view.
ALTER VIEW public.user_tenants_view SET (security_invoker = on);
