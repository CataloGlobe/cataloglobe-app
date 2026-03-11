BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    avatar_url,
    created_at,
    updated_at
  )
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

  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS name;

COMMIT;
