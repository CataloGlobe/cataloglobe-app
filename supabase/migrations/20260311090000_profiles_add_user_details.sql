BEGIN;

-- 1) Schema evolution (additive + updated_at)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.profiles
  ALTER COLUMN created_at SET DEFAULT now();

-- 2) Backfill missing profiles (safe, idempotent)
INSERT INTO public.profiles (id, name, first_name, last_name, avatar_url, created_at, updated_at)
SELECT
  u.id,
  u.raw_user_meta_data->>'name',
  COALESCE(u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'name'),
  u.raw_user_meta_data->>'last_name',
  u.raw_user_meta_data->>'avatar_url',
  now(),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3) Create/replace user → profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, first_name, last_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'name',
    COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4) Keep updated_at in sync
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Ensure RLS + policies (idempotent)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_owner'
  ) THEN
    CREATE POLICY "profiles_select_owner"
    ON public.profiles
    FOR SELECT
    TO public
    USING (id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_owner'
  ) THEN
    CREATE POLICY "profiles_update_owner"
    ON public.profiles
    FOR UPDATE
    TO public
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_owner'
  ) THEN
    CREATE POLICY "profiles_insert_owner"
    ON public.profiles
    FOR INSERT
    TO public
    WITH CHECK (id = auth.uid());
  END IF;
END $$;

COMMIT;
