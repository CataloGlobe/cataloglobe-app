BEGIN;

-- =====================================================================================
-- Editor stili (PR 6 di 6): lo stile di sistema diventa lo stile pronto «CataloGlobe»
-- (spec-app, sezione 3): vetro, alone, foto del piatto a destra, parti fisse chiare.
--
-- 1) Gli stili di sistema MAI ritoccati (config della versione in uso identica alla
--    predefinita di 20260408320000) ricevono una versione nuova con la config nuova:
--    la vecchia resta in «Versioni di prima». Quelli ritoccati dal locale non si toccano.
-- 2) Il trigger dei tenant nuovi crea lo stile di sistema con la config nuova.
--
-- Il JSON nuovo è l'uscita di serializeTokens(cleanLook(applyPreset(DEFAULT_STYLE_TOKENS, "cg"))).
-- =====================================================================================

DO $$
DECLARE
  v_old_config jsonb := jsonb_build_object(
    'colors', jsonb_build_object(
      'pageBackground',   '#FFFFFF',
      'primary',          '#6366f1',
      'headerBackground', '#6366f1',
      'textPrimary',      '#1a1a2e',
      'textSecondary',    '#6b7280',
      'surface',          '#FFFFFF',
      'border',           '#f1f5f9'
    ),
    'typography', jsonb_build_object('fontFamily', 'inter'),
    'header', jsonb_build_object('imageBorderRadiusPx', 12),
    'navigation', jsonb_build_object('style', 'pill'),
    'card', jsonb_build_object(
      'layout', 'list',
      'radius', 'rounded',
      'image', jsonb_build_object('mode', 'show', 'position', 'left')
    )
  );
  v_new_config jsonb := '{"colors": {"pageBackground": "#F6F6FA", "primary": "#5558E0", "accent": "#C85035"}, "typography": {"fontFamily": "inter"}, "appearance": {"borderRadius": "soft", "backgroundPattern": "glow", "patternIntensity": "medium", "featuredStyle": "card", "cardTreatment": "glass"}, "header": {"showLogo": true, "showCoverImage": true, "showActivityName": true, "showCatalogName": true, "showAddress": false, "chrome": "light"}, "navigation": {"style": "tinted"}, "card": {"layout": "list", "productStyle": "card", "image": {"mode": "show", "position": "right"}}, "meta": {"preset": "cg"}}'::jsonb;
BEGIN
  WITH targets AS (
    SELECT
      s.id AS style_id,
      s.tenant_id,
      (SELECT max(v.version) FROM public.style_versions v WHERE v.style_id = s.id) AS last_version
    FROM public.styles s
    JOIN public.style_versions sv ON sv.id = s.current_version_id
    WHERE s.is_system = TRUE
      AND sv.config = v_old_config
  ),
  inserted AS (
    INSERT INTO public.style_versions (tenant_id, style_id, version, config, created_at)
    SELECT t.tenant_id, t.style_id, t.last_version + 1, v_new_config, now()
    FROM targets t
    RETURNING id, style_id
  )
  UPDATE public.styles s
  SET current_version_id = i.id,
      updated_at = now()
  FROM inserted i
  WHERE s.id = i.style_id;
END;
$$;

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
      '{"colors": {"pageBackground": "#F6F6FA", "primary": "#5558E0", "accent": "#C85035"}, "typography": {"fontFamily": "inter"}, "appearance": {"borderRadius": "soft", "backgroundPattern": "glow", "patternIntensity": "medium", "featuredStyle": "card", "cardTreatment": "glass"}, "header": {"showLogo": true, "showCoverImage": true, "showActivityName": true, "showCatalogName": true, "showAddress": false, "chrome": "light"}, "navigation": {"style": "tinted"}, "card": {"layout": "list", "productStyle": "card", "image": {"mode": "show", "position": "right"}}, "meta": {"preset": "cg"}}'::jsonb,
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

-- Come 20260429150000 e 20260429160000: la funzione la chiama solo il trigger.
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant_system_group() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant_system_group() FROM anon, authenticated;

COMMIT;
