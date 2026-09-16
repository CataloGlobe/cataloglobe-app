-- =============================================================================
-- ACL ciclo tavolata (2/3): REVOKE da service_role
-- =============================================================================
-- Nessuna Edge function le chiama: sono gesti dell'host in dashboard. Sotto
-- service_role `auth.uid()` è NULL e `has_permission` risponde false, quindi
-- fallirebbero comunque con 42501: il REVOKE toglie la funzione dall'elenco di
-- ciò che quel ruolo può tentare. Come 20260907170400.
--
-- Nota per il BLOCCO 3: la chiusura automatica di fine giornata
-- (`closed_reason = 'auto'`) girerà da cron o da Edge, cioè sotto un ruolo che
-- qui non ha accesso. Quando arriverà servirà una strada sua — un wrapper
-- dedicato con il suo gate, non un GRANT a service_role su queste cinque, che
-- aprirebbe anche `undo_seating` a un chiamante senza utente.

REVOKE ALL ON FUNCTION
    public.open_seating_for_reservation(uuid),
    public.open_walkin_seating(uuid, uuid[], int),
    public.set_seating_tables(uuid, uuid[]),
    public.close_seating(uuid, text),
    public.undo_seating(uuid)
FROM service_role;
