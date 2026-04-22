-- Corregge handle_new_user: rimuove la colonna `name` (droppata in 20260311130000)
-- dall'INSERT su profiles, che era stata erroneamente reintrodotta in 20260422130000.
-- Il comportamento del consenso GDPR rimane invariato.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_privacy_version text;
  v_terms_version   text;
BEGIN
  -- Crea il profilo utente (senza colonna name — rimossa in 20260311130000)
  INSERT INTO public.profiles (id, first_name, last_name, phone, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'avatar_url',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Registra il consenso GDPR solo se le versioni sono presenti nei metadati.
  v_privacy_version := NEW.raw_user_meta_data->>'consent_privacy_version';
  v_terms_version   := NEW.raw_user_meta_data->>'consent_terms_version';

  IF v_privacy_version IS NOT NULL AND v_terms_version IS NOT NULL THEN
    INSERT INTO public.consent_records (user_id, document_type, document_version, accepted_at)
    VALUES
      (NEW.id, 'privacy_policy',   v_privacy_version, now()),
      (NEW.id, 'terms_of_service', v_terms_version,   now())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
