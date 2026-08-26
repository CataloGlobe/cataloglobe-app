-- =============================================================================
-- SUPPORTO — schema, permessi, RLS
-- =============================================================================
--
-- Ticket di supporto fra un'azienda (tenant) e gli admin di piattaforma.
--
-- Il ticket appartiene all'AZIENDA, non alla persona: chiunque nel tenant
-- abbia `support.read` lo vede, anche se l'ha aperto qualcun altro.
-- `created_by` e' attribuzione, non ownership.
--
-- ── Due modelli di autorizzazione, tenuti separati ───────────────────────────
--   lato cliente     → get_my_tenant_ids() + has_permission_any_activity()
--   lato piattaforma → is_platform_admin()
-- Non si tocca `has_permission()` ne' il seed dei ruoli tenant-scoped.
--
-- ── Perche' has_permission_any_activity() e non has_permission() ─────────────
-- `support.*` ha scope='tenant', quindi la chiamata sarebbe
-- `has_permission('support.read')` senza activity. Con `p_activity_id IS NULL`
-- i branch owner/admin di has_permission() NON correlano il tenant: ritorna
-- true se il chiamante ha il permesso in UN tenant qualsiasi → fuga
-- cross-tenant. `has_permission_any_activity(perm, tenant_id)` ha invece tutti
-- e 3 i branch filtrati su `p_tenant_id`, quindi e' keyed sulla riga.
-- Forma allineata allo stato dell'arte delle tabelle tenant-scoped
-- (`products`, `stories`, `tenant_languages`, `activity_group_members` —
-- migration 20260720130000 / 20260720150000 / 20260720150001):
--     tenant_id IN (SELECT public.get_my_tenant_ids())
--     AND public.has_permission_any_activity('<perm>', tenant_id)
-- Il doppio vincolo e' voluto: appartenenza + permesso keyed. Difesa in
-- profondita', non ridondanza da semplificare.
--
-- Il trigger di riapertura vive in 20260827100001 / 20260827100002:
-- `CREATE FUNCTION` + `REVOKE`/`GRANT` nello stesso file fanno fallire
-- `supabase db push` con SQLSTATE 42601 (docs/patterns/storage-sql.md).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. support_tickets
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id)     ON DELETE CASCADE,
  -- Sede a cui la richiesta si riferisce. Opzionale: molti ticket sono
  -- sull'account, non su una sede. ON DELETE SET NULL e non CASCADE —
  -- cancellare una sede non deve far sparire la conversazione di supporto
  -- che la riguardava.
  activity_id     uuid     REFERENCES public.activities(id)       ON DELETE SET NULL,
  subject         text NOT NULL,
  -- Valori DB in inglese, UI in italiano (Aperta / In lavorazione / Chiusa),
  -- stessa convenzione di `activities.status` e `orders.status`.
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'closed')),
  -- Attribuzione, NON ownership: il ticket e' del tenant. ON DELETE SET NULL
  -- perche' il progetto ha flussi di cancellazione account attivi
  -- (`delete-account`, cron `purge_accounts_daily`) e una FK NO ACTION li
  -- bloccherebbe dentro un job schedulato.
  created_by      uuid     REFERENCES auth.users(id)              ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Denormalizzato dal trigger su support_messages. Serve alla coda admin
  -- ("chi aspetta da piu' tempo") senza un aggregato su support_messages
  -- ad ogni load.
  last_message_at timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);

COMMENT ON TABLE public.support_tickets IS
  'Ticket di supporto azienda ↔ piattaforma. Il ticket appartiene al tenant: '
  'visibile a ogni membro con support.read, non solo a created_by.';
COMMENT ON COLUMN public.support_tickets.created_by IS
  'Chi ha aperto il ticket. Attribuzione, non ownership: non compare in nessuna policy di lettura.';
COMMENT ON COLUMN public.support_tickets.last_message_at IS
  'Denormalizzato: aggiornato dal trigger AFTER INSERT su support_messages. Ordinamento della coda admin.';

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_status
  ON public.support_tickets (tenant_id, status);

-- Coda admin: filtro per stato + ordinamento per attesa.
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_last_message
  ON public.support_tickets (status, last_message_at);

DROP TRIGGER IF EXISTS support_tickets_set_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. support_messages
-- -----------------------------------------------------------------------------
--
-- SENZA `tenant_id` PER DESIGN. Eccezione dichiarata alla regola generale
-- "ogni tabella tenant-scoped ha tenant_id", allo stesso titolo di
-- `order_items` (20260528120000, sezione C14): il figlio deriva l'intera
-- autorizzazione dal padre via EXISTS. Duplicare `tenant_id` qui aprirebbe la
-- possibilita' di una riga incoerente col padre — un vettore, non una difesa.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  body           text NOT NULL,
  author_user_id uuid     REFERENCES auth.users(id)                  ON DELETE SET NULL,
  -- Da quale lato arriva il messaggio. NON impostabile arbitrariamente dal
  -- client: le due policy INSERT separate (sotto) legano `author_kind` al
  -- modello di autorizzazione che ha ammesso la riga. Il vincolo e' nella
  -- policy, non nell'applicazione.
  author_kind    text NOT NULL CHECK (author_kind IN ('customer', 'platform')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_messages IS
  'Messaggi di un ticket di supporto. Senza tenant_id per design: autorizzazione '
  'derivata dal padre via EXISTS, come order_items → orders (20260528120000 C14).';
COMMENT ON COLUMN public.support_messages.author_kind IS
  'customer | platform. Vincolato dalle policy INSERT, non dall''applicazione.';

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
  ON public.support_messages (ticket_id, created_at);

-- -----------------------------------------------------------------------------
-- 3. Seed permessi (scope='tenant')
-- -----------------------------------------------------------------------------
-- category = 'support', nuova. Nessuna delle esistenti (tenant, billing, team,
-- activities, content, scheduling, operations, insights) descrive il supporto:
-- `tenant` raggruppa i permessi SULL'ENTITA' tenant (tenant.read, .manage,
-- .delete, .transfer_ownership), che non e' il caso qui. La colonna e' testo
-- libero senza CHECK e serve al solo raggruppamento in una futura UI permessi.
--
-- ON CONFLICT DO NOTHING: forma difensiva di 20260531150545.
INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('support.read',  'tenant', 'support', 'Vedere le richieste di supporto dell''azienda'),
  ('support.write', 'tenant', 'support', 'Aprire richieste di supporto e rispondere')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Mapping ruoli — owner, admin, manager, staff. NON viewer.
-- -----------------------------------------------------------------------------
-- Righe ESPLICITE anche per owner e admin. La INSERT ... SELECT del seed
-- iniziale (20260526170000) era uno snapshot al momento della migration, non
-- una regola: un permesso nuovo non arriva automaticamente a owner/admin.
-- Gia' costato una migration correttiva con le storie (20260707150000).
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('owner',   'support.read'),
  ('owner',   'support.write'),
  ('admin',   'support.read'),
  ('admin',   'support.write'),
  ('manager', 'support.read'),
  ('manager', 'support.write'),
  ('staff',   'support.read'),
  ('staff',   'support.write')
ON CONFLICT (role, permission_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. RLS — support_tickets
-- -----------------------------------------------------------------------------
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- SELECT — due strade in OR, tenute separate nell'espressione:
--   cliente: membro del tenant DELLA RIGA con support.read
--   piattaforma: is_platform_admin(), cross-tenant per definizione
DROP POLICY IF EXISTS "Roles can read support_tickets" ON public.support_tickets;
CREATE POLICY "Roles can read support_tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    (
      tenant_id IN (SELECT public.get_my_tenant_ids())
      AND public.has_permission_any_activity('support.read', tenant_id)
    )
    OR public.is_platform_admin()
  );

-- INSERT — solo lato cliente. Un admin di piattaforma non apre ticket per
-- conto di un'azienda: non c'e' alcun ramo is_platform_admin() qui.
--
-- Oltre al gate tenant+permesso, la policy inchioda i campi che il client
-- potrebbe altrimenti falsificare in fase di INSERT:
--   created_by = auth.uid()   → nessuna attribuzione a terzi
--   status = 'open'           → nessun ticket che nasce gia' chiuso/in lavorazione
--   closed_at IS NULL         → coerente con status='open'
--   activity_id del tenant    → la FK garantisce che la sede esista, NON che
--                               appartenga a questo tenant. Senza questo
--                               EXISTS un client potrebbe agganciare il ticket
--                               a una sede altrui (dato corrotto, e un
--                               activity_id altrui che rientra nei payload).
DROP POLICY IF EXISTS "Roles can insert support_tickets" ON public.support_tickets;
CREATE POLICY "Roles can insert support_tickets"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('support.write', tenant_id)
    AND created_by = auth.uid()
    AND status     = 'open'
    AND closed_at IS NULL
    AND (
      activity_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.activities a
        WHERE a.id = support_tickets.activity_id
          AND a.tenant_id = support_tickets.tenant_id
      )
    )
  );

-- UPDATE — SOLO piattaforma. Il cliente non aggiorna mai il ticket
-- direttamente: la riapertura su nuovo messaggio passa dal trigger
-- SECURITY DEFINER (20260827100001), che gira come owner e non e' soggetto a
-- questa policy. Cambio di stato = azione della piattaforma.
DROP POLICY IF EXISTS "Platform admins can update support_tickets" ON public.support_tickets;
CREATE POLICY "Platform admins can update support_tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING       (public.is_platform_admin())
  WITH CHECK  (public.is_platform_admin());

-- DELETE — negata ESPLICITAMENTE, non omessa. Stesso pattern di
-- `platform_admins` / `schedule_targets`: una policy `false` documenta
-- l'intenzione nel catalogo, l'assenza di policy e' indistinguibile da una
-- dimenticanza. I ticket non si cancellano in questa fase (nemmeno dalla
-- piattaforma): sono la traccia di una conversazione.
DROP POLICY IF EXISTS "No direct DELETE on support_tickets" ON public.support_tickets;
CREATE POLICY "No direct DELETE on support_tickets"
  ON public.support_tickets FOR DELETE TO authenticated
  USING (false);

-- -----------------------------------------------------------------------------
-- 6. RLS — support_messages (autorizzazione derivata dal padre)
-- -----------------------------------------------------------------------------
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- SELECT — stessa condizione della SELECT sui ticket, valutata sul padre.
-- Colonna del figlio QUALIFICATA (`support_messages.ticket_id`), come in
-- order_items → orders.
DROP POLICY IF EXISTS "Roles can read support_messages" ON public.support_messages;
CREATE POLICY "Roles can read support_messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (
          (
            t.tenant_id IN (SELECT public.get_my_tenant_ids())
            AND public.has_permission_any_activity('support.read', t.tenant_id)
          )
          OR public.is_platform_admin()
        )
    )
  );

-- INSERT — DUE policy separate, ed e' esattamente questo che vincola
-- `author_kind`. Le policy permissive sullo stesso comando sono in OR: una
-- riga passa solo se soddisfa interamente uno dei due rami, e ciascun ramo
-- fissa il proprio `author_kind`. Un cliente non puo' scrivere 'platform'
-- (fallirebbe il ramo 1 sul letterale e il ramo 2 su is_platform_admin), e
-- viceversa. Nessuna fiducia nel client.
DROP POLICY IF EXISTS "Customers can insert support_messages" ON public.support_messages;
CREATE POLICY "Customers can insert support_messages"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_kind    = 'customer'
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND t.tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission_any_activity('support.write', t.tenant_id)
    )
  );

DROP POLICY IF EXISTS "Platform admins can insert support_messages" ON public.support_messages;
CREATE POLICY "Platform admins can insert support_messages"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_kind    = 'platform'
    AND author_user_id = auth.uid()
    AND public.is_platform_admin()
  );

-- UPDATE / DELETE — negate esplicitamente per ENTRAMBI i lati. I messaggi
-- sono immutabili: un thread di supporto e' anche un registro di cosa e'
-- stato detto e quando. Correggere = scrivere un altro messaggio.
DROP POLICY IF EXISTS "No direct UPDATE on support_messages" ON public.support_messages;
CREATE POLICY "No direct UPDATE on support_messages"
  ON public.support_messages FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "No direct DELETE on support_messages" ON public.support_messages;
CREATE POLICY "No direct DELETE on support_messages"
  ON public.support_messages FOR DELETE TO authenticated
  USING (false);

COMMIT;
