-- =============================================================================
-- SUPPORTO — le policy di deny da PERMISSIVE a RESTRICTIVE
-- =============================================================================
--
-- 20260827100000 ha creato le tre deny (`USING (false)`) come PERMISSIVE.
-- Oggi negano davvero, ma solo per un accidente: sono l'UNICA policy per quel
-- comando. Le policy permissive si compongono in OR — una permissiva aggiunta
-- domani sullo stesso comando si somma e scavalca la deny IN SILENZIO,
-- lasciando in piedi un commento che continua a dichiarare "negata
-- esplicitamente" mentre non lo e' piu'. Il fallimento e' invisibile: nessun
-- errore, nessun avviso, solo una riga che passa.
--
-- Le RESTRICTIVE si compongono invece in AND con TUTTE le policy di quel
-- comando: `false AND qualunque_cosa` resta false. Diventa invalicabile finche'
-- qualcuno non la droppa a mano — che e' esattamente l'intenzione dichiarata.
--
-- Forma gia' in uso nel repo su `schedule_targets` (20260528120000) e
-- `tenant_membership_activities` (20260526170000). 20260827100000 aveva copiato
-- la forma piu' debole, quella di `platform_admins`.
--
-- ── Verifica di composizione (fatta prima di scrivere questo file) ───────────
-- Una RESTRICTIVE spegne ogni policy permissiva sullo stesso comando, quindi
-- va applicata solo dove non ne esiste una legittima. Stato da pg_policies:
--   support_tickets  DELETE → nessun'altra policy
--   support_messages UPDATE → nessun'altra policy
--   support_messages DELETE → nessun'altra policy
-- Le permissive del dominio vivono su SELECT / INSERT / UPDATE-tickets, che
-- questo file NON tocca. Nessun accesso legittimo viene chiuso.
--
-- Il flag PERMISSIVE/RESTRICTIVE non e' alterabile: serve DROP + CREATE. Le
-- tre policy sono dello stesso batch (20260827100000), non di migration altrui.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- support_tickets — DELETE
-- -----------------------------------------------------------------------------
-- I ticket non si cancellano, nemmeno dalla piattaforma: sono la traccia di una
-- conversazione. La cancellazione passa da una migration esplicita.
DROP POLICY IF EXISTS "No direct DELETE on support_tickets" ON public.support_tickets;
CREATE POLICY "No direct DELETE on support_tickets"
  ON public.support_tickets
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

-- -----------------------------------------------------------------------------
-- support_messages — UPDATE + DELETE
-- -----------------------------------------------------------------------------
-- I messaggi sono immutabili per entrambi i lati. Correggere = scriverne un
-- altro.
DROP POLICY IF EXISTS "No direct UPDATE on support_messages" ON public.support_messages;
CREATE POLICY "No direct UPDATE on support_messages"
  ON public.support_messages
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "No direct DELETE on support_messages" ON public.support_messages;
CREATE POLICY "No direct DELETE on support_messages"
  ON public.support_messages
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

COMMIT;
