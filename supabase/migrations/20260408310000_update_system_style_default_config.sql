BEGIN;

-- =====================================================================================
-- Update default config for all existing system styles to CataloGlobe brand values.
-- Also update the tenant bootstrap trigger so future tenants get the new defaults.
-- =====================================================================================

-- 1) Build new default config as a constant expression
DO $$
DECLARE
  v_new_config jsonb := jsonb_build_object(
    'colors', jsonb_build_object(
      'pageBackground',   '#FFFFFF',
      'primary',          '#6C5CE7',
      'headerBackground', '#6C5CE7',
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
  -- Update the current_version config for every system style
  UPDATE public.style_versions sv
  SET config = v_new_config
  FROM public.styles s
  WHERE sv.id = s.current_version_id
    AND s.is_system = TRUE;

  -- Bump updated_at on those styles so the editor reflects the change
  UPDATE public.styles
  SET updated_at = now()
  WHERE is_system = TRUE;
END;
$$;

-- 2) Update the tenant bootstrap trigger to use the new default config
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
          'primary',          '#6C5CE7',
          'headerBackground', '#6C5CE7',
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
