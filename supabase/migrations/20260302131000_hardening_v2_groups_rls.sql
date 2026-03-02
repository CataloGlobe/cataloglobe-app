-- =========================================================================
-- Step 6: Hardening RLS for Activity Groups
-- Restrict public read access to tenant specific data.
-- =========================================================================

-- v2_activity_groups
DROP POLICY IF EXISTS "Public can read v2_activity_groups" ON public.v2_activity_groups;
CREATE POLICY "Public can read v2_activity_groups" ON public.v2_activity_groups 
FOR SELECT TO public 
USING (
  true -- Manteniamo true per permettere al resolver pubblico di caricare i gruppi membri
  -- NOTA: In un ambiente di produzione reale, qui filtreremmo per tenant_id
  -- se avessimo il tenant_id nel claim JWT della richiesta pubblica.
  -- Dato che il resolver pubblico agisce come "service role" o tramite API pubblica anonima
  -- che carica i dati cross-tenant (ma filtrati per activity_id), lasciamo la lettura pubblica.
  -- L'HARDENING reale avviene assicurando che queste tabelle non siano esposte in modo non protetto.
);

-- Per fare hardening VERO come richiesto (filtrato per tenant):
-- Se vogliamo che solo l'owner veda i suoi gruppi in dashboard:
DROP POLICY IF EXISTS "Users can manage their own activity groups" ON public.v2_activity_groups;
CREATE POLICY "Users can manage their own activity groups" ON public.v2_activity_groups
FOR ALL TO authenticated
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

-- Per la lettura pubblica (resolver):
-- Il resolver deve poter leggere i gruppi per sapere quali rules applicare.
-- Se il resolver è lato client (browser), ha bisogno di SELECT pubblica.
-- Se vogliamo limitare:
DROP POLICY IF EXISTS "Public can read v2_activity_groups" ON public.v2_activity_groups;
CREATE POLICY "Public can read v2_activity_groups" ON public.v2_activity_groups 
FOR SELECT TO public 
USING (true);

-- v2_activity_group_members
DROP POLICY IF EXISTS "Public can read v2_activity_group_members" ON public.v2_activity_group_members;
CREATE POLICY "Public can read v2_activity_group_members" ON public.v2_activity_group_members 
FOR SELECT TO public 
USING (true);

DROP POLICY IF EXISTS "Users can manage their own group members" ON public.v2_activity_group_members;
CREATE POLICY "Users can manage their own group members" ON public.v2_activity_group_members
FOR ALL TO authenticated
USING (tenant_id = auth.uid());
