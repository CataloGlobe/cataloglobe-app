-- =============================================================================
-- Multi menù: archivio della conversione delle regole `layout`
-- =============================================================================
-- Una riga per ogni regola `layout` convertita da 20261017120100: cosa era
-- (riga di `schedule_layout`, `on_air_since`, acceso o spento) e cosa è
-- diventata (la stessa regola `menu`, la gemella `style`). Serve a tornare
-- indietro e a riconoscere le gemelle nate dalla conversione.
-- Nessuna FK: eliminare una regola dopo non deve fermarsi qui.
-- Solo service role: RLS accesa senza politiche, niente grant ai client.
-- Rollback: DROP TABLE public.schedule_multimenu_conversion;
-- =============================================================================

CREATE TABLE public.schedule_multimenu_conversion (
    schedule_id           uuid PRIMARY KEY,
    tenant_id             uuid NOT NULL,
    became                text NOT NULL CHECK (became IN ('menu', 'style')),
    style_rule_id         uuid,
    catalog_id            uuid,
    style_id              uuid NOT NULL,
    layout_row_id         uuid NOT NULL,
    layout_row_created_at timestamptz NOT NULL,
    enabled_before        boolean NOT NULL,
    on_air_since_before   timestamptz NOT NULL,
    on_air_since_after    timestamptz NOT NULL,
    rank_in_tenant        integer NOT NULL,
    in_cycle              boolean NOT NULL,
    converted_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_multimenu_conversion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schedule_multimenu_conversion FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.schedule_multimenu_conversion IS
    'Multi menù: regole layout convertite in menu + style (20261017120100). style_rule_id = la gemella style; in_cycle = ordine non riproducibile in tutte le sedi.';
