-- =============================================================================
-- printers — stampanti cloud Sunmi collegate a una sede.
-- =============================================================================
--
-- Una riga = un dispositivo fisico (identificato dal serial number `sn`)
-- collegato a UNA sede. Il binding lato Sunmi (bindShop) avviene PRIMA
-- dell'INSERT, nell'edge function `sunmi-bind-printer`: se Sunmi rifiuta, la
-- riga non viene creata (niente stampanti fantasma).
--
-- ── Cardinalita' ────────────────────────────────────────────────────────────
--   * `sn` UNIQUE globale: un dispositivo fisico non puo' stare in due sedi
--     (ne' in due tenant). Nessun vincolo di unicita' su `activity_id`: piu'
--     stampanti per sede (cucina, bar) sono previste e condividono
--     `activities.sunmi_shop_id`.
--   * FK `activity_id` ON DELETE CASCADE: eliminata la sede, spariscono le sue
--     stampanti. Il binding lato Sunmi resta orfano: accettato, la sede cancella
--     anche lo shop_id e un eventuale re-bind sovrascrive.
--
-- ── Colonne ─────────────────────────────────────────────────────────────────
--   * `label`: nome leggibile scelto dall'utente ("Cucina", "Bar").
--   * `is_active`: kill-switch applicativo per sospendere una stampante senza
--     scollegarla. Non usato in questo blocco, previsto per l'instradamento
--     delle comande.
--   * `last_online_at`: ultimo momento in cui onlineStatus l'ha vista online.
--     Resta NULL finche' non esiste un polling (blocco successivo).
--
-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Stesso perimetro dei tavoli: dispositivi fisici della sede, staff incluso.
--   * lettura:   has_permission('tables.read',   activity_id)
--   * scrittura: has_permission('tables.manage', activity_id)
-- Le policy di INSERT/DELETE esistono per completezza del pattern, ma i
-- percorsi applicativi passano dalle edge function con service_role (che devono
-- chiamare bindShop/unbindShop lato Sunmi prima di toccare la riga).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.printers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activity_id     uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    sn              text NOT NULL,
    label           text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    last_online_at  timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT printers_sn_key UNIQUE (sn),
    CONSTRAINT printers_sn_not_empty CHECK (length(trim(sn)) > 0),
    CONSTRAINT printers_label_not_empty CHECK (length(trim(label)) > 0)
);

COMMENT ON TABLE public.printers IS
    'Stampanti cloud Sunmi collegate a una sede. sn = serial number del dispositivo (UNIQUE globale). Il binding Sunmi (bindShop) precede sempre l''INSERT.';
COMMENT ON COLUMN public.printers.sn IS
    'Serial number Sunmi, normalizzato uppercase/trim dall''edge function. UNIQUE globale: un dispositivo sta in una sola sede.';
COMMENT ON COLUMN public.printers.last_online_at IS
    'Ultimo istante in cui onlineStatus ha riportato is_online. NULL finche'' non esiste un polling.';

CREATE INDEX IF NOT EXISTS idx_printers_tenant_id   ON public.printers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_printers_activity_id ON public.printers (activity_id);

-- Trigger updated_at — riusa public.set_updated_at() (gia' presente nello schema)
DROP TRIGGER IF EXISTS set_updated_at_printers ON public.printers;
CREATE TRIGGER set_updated_at_printers
    BEFORE UPDATE ON public.printers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS — pattern has_permission (tables.read / tables.manage) ──────────────
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can read printers" ON public.printers;
CREATE POLICY "Roles can read printers"
    ON public.printers FOR SELECT TO authenticated
    USING (public.has_permission('tables.read', activity_id));

DROP POLICY IF EXISTS "Roles can insert printers" ON public.printers;
CREATE POLICY "Roles can insert printers"
    ON public.printers FOR INSERT TO authenticated
    WITH CHECK (public.has_permission('tables.manage', activity_id));

DROP POLICY IF EXISTS "Roles can update printers" ON public.printers;
CREATE POLICY "Roles can update printers"
    ON public.printers FOR UPDATE TO authenticated
    USING (public.has_permission('tables.manage', activity_id))
    WITH CHECK (public.has_permission('tables.manage', activity_id));

DROP POLICY IF EXISTS "Roles can delete printers" ON public.printers;
CREATE POLICY "Roles can delete printers"
    ON public.printers FOR DELETE TO authenticated
    USING (public.has_permission('tables.manage', activity_id));
