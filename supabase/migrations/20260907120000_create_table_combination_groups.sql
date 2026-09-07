-- ============================================================================
-- table_combination_groups — gruppi di accostamento fisico dei tavoli
-- ============================================================================
--
-- PERCHE' UNA TABELLA E NON UN FLAG / UN ARRAY / UN GRAFO DI COPPIE
--
-- Un flag booleano "combinabile" dice che il tavolo si accosta, ma non A COSA:
-- il motore finirebbe per proporre l'unione fra tavoli ai due capi della sala.
-- Una regola sbagliata costa piu' di nessuna regola (il cameriere sposta mobili).
--
-- Un grafo esplicito di coppie e' preciso ma impossibile da compilare: 20 tavoli
-- sono 190 coppie. Nessun ristoratore lo riempie.
--
-- Un gruppo nominato e' una scelta sola per tavolo (20 tavoli = 20 dropdown) ed
-- e' preciso quanto lo rende il ristoratore: se chiama "Fila finestra" i quattro
-- tavoli in fila, dentro quel gruppo l'accostamento e' vero. La transitivita' e'
-- una semplificazione consapevole (in una fila di sei, il primo e l'ultimo non
-- sono adiacenti): si governa tenendo i gruppi piccoli, ed e' il motore di
-- assegnazione — non il modello — a poter poi preferire tavoli vicini nel
-- `sort_order` interno al gruppo.
--
-- NON si riusa `table_zones`: la zona e' l'area operativa (Sala, Dehors, Bancone),
-- serve al servizio e puo' contenere venti tavoli sparsi. L'accostabilita' e'
-- adiacenza fisica. Sono cose diverse: sull'ambiente attuale le zone sono
-- compilate su 6 tavoli su 13, quindi "stessa zona = accostabile" non reggerebbe
-- nemmeno come regola implicita.
--
-- DEFAULT SICURO: `tables.combination_group_id IS NULL` = tavolo non accostabile
-- ad alcunche'. Chi non configura nulla non riceve mai una proposta di unione
-- sbagliata; riceve solo assegnazioni su tavolo singolo. Opt-in, mai opt-out.
--
-- Struttura speculare a `table_zones` (stesso pattern CRUD, stesse policy).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.table_combination_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT table_combination_groups_name_not_empty
        CHECK (length(trim(both from name)) > 0),
    CONSTRAINT table_combination_groups_unique_name_per_activity
        UNIQUE (activity_id, name),
    -- Ridondante rispetto alla PK, ma necessaria come target della FK composita
    -- di `tables`: impedisce di assegnare a un tavolo un gruppo di un'altra sede.
    CONSTRAINT table_combination_groups_id_activity_unique
        UNIQUE (id, activity_id)
);

COMMENT ON TABLE public.table_combination_groups IS
    'Gruppi di tavoli fisicamente accostabili fra loro. Distinto da table_zones (area operativa). NULL su tables.combination_group_id = tavolo non accostabile.';

CREATE INDEX IF NOT EXISTS idx_table_combination_groups_activity_id
    ON public.table_combination_groups (activity_id);
CREATE INDEX IF NOT EXISTS idx_table_combination_groups_tenant_id
    ON public.table_combination_groups (tenant_id);

DROP TRIGGER IF EXISTS set_updated_at_table_combination_groups
    ON public.table_combination_groups;
CREATE TRIGGER set_updated_at_table_combination_groups
    BEFORE UPDATE ON public.table_combination_groups
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.table_combination_groups ENABLE ROW LEVEL SECURITY;

-- Stesso permesso dei tavoli: chi gestisce i tavoli gestisce i loro gruppi.
DROP POLICY IF EXISTS "Roles can read table_combination_groups" ON public.table_combination_groups;
CREATE POLICY "Roles can read table_combination_groups"
    ON public.table_combination_groups FOR SELECT TO authenticated
    USING (public.has_permission('tables.read', activity_id));

DROP POLICY IF EXISTS "Roles can insert table_combination_groups" ON public.table_combination_groups;
CREATE POLICY "Roles can insert table_combination_groups"
    ON public.table_combination_groups FOR INSERT TO authenticated
    WITH CHECK (public.has_permission('tables.manage', activity_id));

DROP POLICY IF EXISTS "Roles can update table_combination_groups" ON public.table_combination_groups;
CREATE POLICY "Roles can update table_combination_groups"
    ON public.table_combination_groups FOR UPDATE TO authenticated
    USING (public.has_permission('tables.manage', activity_id))
    WITH CHECK (public.has_permission('tables.manage', activity_id));

DROP POLICY IF EXISTS "Roles can delete table_combination_groups" ON public.table_combination_groups;
CREATE POLICY "Roles can delete table_combination_groups"
    ON public.table_combination_groups FOR DELETE TO authenticated
    USING (public.has_permission('tables.manage', activity_id));
