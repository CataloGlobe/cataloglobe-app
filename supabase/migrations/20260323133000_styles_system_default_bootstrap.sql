BEGIN;

-- =====================================================================================
-- Restore system/default style invariant:
-- - exactly one system style per tenant (at most one enforced by partial unique index)
-- - backfill missing system styles + initial style_versions
-- - protect system styles from deletion at DB level
-- - auto-create system style + initial version on tenant creation
-- =====================================================================================

-- 1) Normalize legacy anomalies: if a tenant has multiple system styles,
--    keep the oldest and demote the rest.
WITH ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY s.tenant_id
      ORDER BY s.created_at ASC, s.id ASC
    ) AS rn
  FROM public.styles s
  WHERE s.is_system = TRUE
)
UPDATE public.styles s
SET
  is_system = FALSE,
  updated_at = now()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- 2) Backfill one missing system style per tenant.
WITH missing_tenants AS (
  SELECT t.id AS tenant_id
  FROM public.tenants t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.styles s
    WHERE s.tenant_id = t.id
      AND s.is_system = TRUE
  )
),
inserted_styles AS (
  INSERT INTO public.styles (
    tenant_id,
    name,
    is_system,
    is_active,
    created_at,
    updated_at
  )
  SELECT
    mt.tenant_id,
    'Default',
    TRUE,
    TRUE,
    now(),
    now()
  FROM missing_tenants mt
  RETURNING id, tenant_id
),
inserted_versions AS (
  INSERT INTO public.style_versions (
    tenant_id,
    style_id,
    version,
    config,
    created_at
  )
  SELECT
    s.tenant_id,
    s.id,
    1,
    jsonb_build_object(
      'colors', jsonb_build_object(
        'pageBackground', '#f3f4f6',
        'primary', '#6366f1',
        'headerBackground', '#ffffff',
        'textPrimary', '#0f172a',
        'textSecondary', '#64748b',
        'surface', '#ffffff',
        'border', '#f1f5f9'
      ),
      'typography', jsonb_build_object(
        'fontFamily', 'inter'
      ),
      'header', jsonb_build_object(
        'imageBorderRadiusPx', 12
      ),
      'navigation', jsonb_build_object(
        'style', 'pill'
      ),
      'card', jsonb_build_object(
        'layout', 'grid',
        'radius', 'rounded',
        'image', jsonb_build_object(
          'mode', 'show',
          'position', 'left'
        )
      )
    ),
    now()
  FROM inserted_styles s
  RETURNING id, style_id
)
UPDATE public.styles st
SET
  current_version_id = v.id,
  updated_at = now()
FROM inserted_versions v
WHERE st.id = v.style_id;

-- 3) Enforce at most one system style per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS styles_one_system_per_tenant_uidx
  ON public.styles (tenant_id)
  WHERE is_system = TRUE;

-- 4) DB-level protection: system styles cannot be deleted.
CREATE OR REPLACE FUNCTION public.prevent_delete_system_styles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system = TRUE THEN
    RAISE EXCEPTION 'cannot_delete_system_style';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_system_styles ON public.styles;
CREATE TRIGGER trg_prevent_delete_system_styles
BEFORE DELETE ON public.styles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delete_system_styles();

-- 5) Extend tenant bootstrap trigger: ensure one default system style exists
--    and wire its initial version.
CREATE OR REPLACE FUNCTION public.handle_new_tenant_system_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_style_id uuid;
  v_version_id uuid;
BEGIN
  -- Existing behavior: create system activity group
  INSERT INTO public.activity_groups (tenant_id, name, is_system)
  VALUES (NEW.id, 'Tutte le sedi', TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- New behavior: ensure default system style exists
  SELECT s.id
  INTO v_style_id
  FROM public.styles s
  WHERE s.tenant_id = NEW.id
    AND s.is_system = TRUE
  ORDER BY s.created_at ASC, s.id ASC
  LIMIT 1;

  IF v_style_id IS NULL THEN
    INSERT INTO public.styles (
      tenant_id,
      name,
      is_system,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'Default',
      TRUE,
      TRUE,
      now(),
      now()
    )
    RETURNING id INTO v_style_id;

    INSERT INTO public.style_versions (
      tenant_id,
      style_id,
      version,
      config,
      created_at
    )
    VALUES (
      NEW.id,
      v_style_id,
      1,
      jsonb_build_object(
        'colors', jsonb_build_object(
          'pageBackground', '#f3f4f6',
          'primary', '#6366f1',
          'headerBackground', '#ffffff',
          'textPrimary', '#0f172a',
          'textSecondary', '#64748b',
          'surface', '#ffffff',
          'border', '#f1f5f9'
        ),
        'typography', jsonb_build_object(
          'fontFamily', 'inter'
        ),
        'header', jsonb_build_object(
          'imageBorderRadiusPx', 12
        ),
        'navigation', jsonb_build_object(
          'style', 'pill'
        ),
        'card', jsonb_build_object(
          'layout', 'grid',
          'radius', 'rounded',
          'image', jsonb_build_object(
            'mode', 'show',
            'position', 'left'
          )
        )
      ),
      now()
    )
    RETURNING id INTO v_version_id;

    UPDATE public.styles
    SET
      current_version_id = v_version_id,
      updated_at = now()
    WHERE id = v_style_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
