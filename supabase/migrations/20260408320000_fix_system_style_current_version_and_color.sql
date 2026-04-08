BEGIN;

-- =====================================================================================
-- Fix 1: Wire current_version_id for system styles where it is NULL but a
--        style_version row exists (left unset by the previous migration).
-- Fix 2: Update config to use the real CataloGlobe brand color (#6366f1).
-- =====================================================================================

-- 1) Point current_version_id to the latest version for any system style
--    that currently has a NULL pointer.
UPDATE public.styles s
SET
  current_version_id = (
    SELECT sv.id
    FROM public.style_versions sv
    WHERE sv.style_id = s.id
    ORDER BY sv.version DESC
    LIMIT 1
  ),
  updated_at = now()
WHERE s.is_system = TRUE
  AND s.current_version_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.style_versions sv
    WHERE sv.style_id = s.id
  );

-- 2) Update config for ALL system style current versions to the correct brand color.
--    Replaces #6C5CE7 (wrong) and #6366f1 (old default) with the definitive value.
DO $$
DECLARE
  v_new_config jsonb := jsonb_build_object(
    'colors', jsonb_build_object(
      'pageBackground',   '#FFFFFF',
      'primary',          '#6366f1',
      'headerBackground', '#6366f1',
      'textPrimary',      '#1a1a2e',
      'textSecondary',    '#6b7280',
      'surface',          '#FFFFFF',
      'border',           '#f1f5f9'
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
      'layout', 'list',
      'radius', 'rounded',
      'image', jsonb_build_object(
        'mode', 'show',
        'position', 'left'
      )
    )
  );
BEGIN
  UPDATE public.style_versions sv
  SET config = v_new_config
  FROM public.styles s
  WHERE sv.id = s.current_version_id
    AND s.is_system = TRUE;

  UPDATE public.styles
  SET updated_at = now()
  WHERE is_system = TRUE;
END;
$$;

-- 3) Update the tenant bootstrap trigger to use the correct brand color
--    for all future tenants.
CREATE OR REPLACE FUNCTION public.handle_new_tenant_system_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_style_id   uuid;
  v_version_id uuid;
BEGIN
  -- Existing behavior: create system activity group
  INSERT INTO public.activity_groups (tenant_id, name, is_system)
  VALUES (NEW.id, 'Tutte le sedi', TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- Ensure default system style exists for new tenant
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
          'pageBackground',   '#FFFFFF',
          'primary',          '#6366f1',
          'headerBackground', '#6366f1',
          'textPrimary',      '#1a1a2e',
          'textSecondary',    '#6b7280',
          'surface',          '#FFFFFF',
          'border',           '#f1f5f9'
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
          'layout', 'list',
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
