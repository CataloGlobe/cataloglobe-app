-- =============================================================================
-- Programmazione: una regola su tutte le sedi la crea o la estende solo
-- owner/admin.
-- =============================================================================
--
-- Problema: la PERMISSIVE INSERT di schedules controlla solo
-- has_permission_any_activity('scheduling.write'), senza guardare
-- apply_to_all; la PERMISSIVE UPDATE usa can_write_schedule(id) anche nel
-- WITH CHECK, ma la funzione legge la riga com'era prima dell'UPDATE. Su
-- staging (2026-10-07, in transazione annullata) un manager di due sedi su
-- quattro ha creato una regola apply_to_all e ha acceso apply_to_all su una
-- sua regola: in entrambi i casi la regola vale per tutte le sedi
-- dell'azienda, che lui non gestisce, e da lì in poi non può più modificarla
-- (can_write_schedule riserva apply_to_all a owner/admin).
--
-- Soluzione: due RESTRICTIVE, come CG-01 (20260930150000), sul valore nuovo
-- della riga: apply_to_all = false oppure owner/admin del tenant della riga.
-- Le PERMISSIVE esistenti restano. Il flusso owner/admin (createRuleDraft:
-- INSERT e poi UPDATE apply_to_all = true) è invariato.
--
-- Idempotente: DROP POLICY IF EXISTS prima di ogni CREATE.
-- =============================================================================

DROP POLICY IF EXISTS "Apply to all only owner admin on insert" ON public.schedules;
CREATE POLICY "Apply to all only owner admin on insert" ON public.schedules
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    apply_to_all = false
    OR public.has_permission_owner_admin('scheduling.write', tenant_id)
  );

DROP POLICY IF EXISTS "Apply to all only owner admin on update" ON public.schedules;
CREATE POLICY "Apply to all only owner admin on update" ON public.schedules
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    apply_to_all = false
    OR public.has_permission_owner_admin('scheduling.write', tenant_id)
  );
