-- FIX Security Advisor (rls_disabled_in_public): public.v_other_owner
-- Tabella orfana — RLS disabilitata, 0 policy, 1 colonna (owner_user_id), nessun tenant_id.
-- Zero uso runtime nel repo (solo nei tipi auto-generati). Zero dipendenze in pg_depend.
-- Creata fuori-banda (nessuna migration la crea). Rimozione sicura.
DROP TABLE IF EXISTS public.v_other_owner;
