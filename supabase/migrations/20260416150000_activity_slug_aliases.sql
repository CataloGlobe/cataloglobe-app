-- ============================================================
-- Tabella alias slug per le sedi
-- Quando un operatore cambia slug, il vecchio diventa un alias
-- di redirect verso il nuovo. Un alias occupa lo slot globale
-- finché non viene eliminato consapevolmente.
-- ============================================================

CREATE TABLE activity_slug_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT activity_slug_aliases_slug_unique UNIQUE (slug)
);

-- Indice per lookup pubblico (resolver Edge Function)
CREATE INDEX idx_activity_slug_aliases_slug
    ON activity_slug_aliases (slug);

-- Indice per lookup per activity (UI lista alias)
CREATE INDEX idx_activity_slug_aliases_activity_id
    ON activity_slug_aliases (activity_id);

-- RLS
ALTER TABLE activity_slug_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view own aliases"
    ON activity_slug_aliases FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM activities a
            JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
            WHERE a.id = activity_slug_aliases.activity_id
              AND tm.user_id = auth.uid()
              AND tm.status  = 'active'
        )
    );

CREATE POLICY "Tenant members can insert own aliases"
    ON activity_slug_aliases FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM activities a
            JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
            WHERE a.id = activity_slug_aliases.activity_id
              AND tm.user_id = auth.uid()
              AND tm.status  = 'active'
        )
    );

CREATE POLICY "Tenant members can delete own aliases"
    ON activity_slug_aliases FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM activities a
            JOIN tenant_memberships tm ON tm.tenant_id = a.tenant_id
            WHERE a.id = activity_slug_aliases.activity_id
              AND tm.user_id = auth.uid()
              AND tm.status  = 'active'
        )
    );
